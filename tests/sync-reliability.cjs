'use strict';

/* =========================================================
   Task 5J：存储 / 云同步可靠性
   =========================================================

   旧同步只有一条 syncTail 串行链：await 云 SDK 的返回值，没有超时、
   没有重试、失败也不把状态放回队列。三件事都会真的出事：

     · 一次请求卡住 → syncTail 永不释放 → 从此再不同步，界面毫无提示
     · 一次瞬时抖动 → 丢掉这一轮，等用户下次操作才再试（可能永远不会来）
     · 断网期间的作答 → 没人管，恢复联网也不会补

   这一组把三件事都钉住，并额外守住一条底线：
   清空这种破坏性操作**宁可报错，也不能假装完成**。
   ========================================================= */

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const ROOT=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(ROOT,name),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));

/* 生产常量单独锁：测试里会把超时改成毫秒级，但生产值不能被悄悄放开。 */
const PRODUCTION=read('storage.js');
const productionNumber=name=>{
  const match=PRODUCTION.match(new RegExp(name+' = (\\d+);'));
  if(!match)throw new Error('storage.js 里找不到 '+name);
  return Number(match[1]);
};

test('★ 超时与退避的预算必须有界，且重试次数是明确的',()=>{
  const timeout=productionNumber('SYNC_TIMEOUT_MS');
  const attempts=productionNumber('SYNC_ATTEMPTS');
  const retryMin=productionNumber('RETRY_MIN_MS');
  const retryMax=productionNumber('RETRY_MAX_MS');

  assert.ok(timeout>=5000&&timeout<=20000,
    `单次同步超时 ${timeout}ms —— 太短会误判，太长会把「卡住」拖成「没有同步」`);
  assert.equal(attempts,2,'瞬时错误应当重试一次');
  assert.ok(retryMin>=3000&&retryMin<=15000,`退避起点 ${retryMin}ms 不合理`);
  assert.ok(retryMax<=120000,`退避上限 ${retryMax}ms —— 太大会让记录长时间不同步`);
  assert.ok(retryMax>retryMin,'退避上限必须大于起点');
});

/* =========================================================
   沙箱：把超时改成毫秒级，其余照生产代码跑
   ========================================================= */

function harness({online=true,failures=[]}={}){
  const calls=[];
  const records={};
  const statuses=[];

  const state={
    hang:false,          // 云请求永不返回
    failures:failures.map(f=>({...f,left:f.times??1}))
  };

  const nextFailure=table=>{
    const hit=state.failures.find(f=>(!f.table||f.table===table)&&f.left>0);
    if(!hit)return null;
    hit.left--;
    return hit;
  };

  function db(){
    return {from(table){
      let op='select',body,filters={},opts={};
      const q={
        select(){return q;},
        eq(key,value){filters[key]=value;return q;},
        maybeSingle(){return q;},
        upsert(value,options){op='upsert';body=copy(value);opts=options;return q;},
        delete(){op='delete';return q;},
        then(resolve,reject){
          return (async()=>{
            calls.push({table,op});

            // 「卡住」：既不改状态也不抛错，只是在超时之前什么都不发生
            if(state.hang){
              await new Promise(()=>{});
            }

            const failure=nextFailure(table);
            if(failure){
              return {error:{message:failure.message},data:null};
            }

            const rows=records[table]||=[];

            if(op==='select')return {error:null,data:rows.find(r=>r.user_id===filters.user_id)||null};
            if(op==='delete'){records[table]=rows.filter(r=>r.user_id!==filters.user_id);}
            if(op==='upsert'){
              for(const row of [].concat(body)){
                const keys=opts.onConflict.split(',');
                const index=rows.findIndex(old=>keys.every(key=>old[key]===row[key]));
                if(index<0)rows.push(row);else rows[index]={...rows[index],...row};
              }
            }
            return {data:null,error:null};
          })().then(resolve,reject);
        }
      };
      return q;
    }};
  }

  const events={};

  const window={
    navigator:{onLine:online},
    // cloudbase-client.js 会做 window.fetch.bind(window) 再改写它
    fetch:async()=>{throw new Error('Unexpected network');},
    document:{visibilityState:'visible',addEventListener(k,fn){(events[k]||=[]).push(fn);}},
    cloudbase:{init(){return {auth:{},rdb(){return db();}};}},
    addEventListener(k,fn){(events[k]||=[]).push(fn);},
    dispatchEvent(event){for(const fn of events[event.type]||[])fn(event);},
    CalcDailyApp:{applyCloudState(){},getState(){return {};}}
  };

  const localStorage=new Map();

  const context=vm.createContext({
    window,
    document:window.document,
    console:{log(){},warn(){},error(){}},
    Date,
    JSON,
    Math,
    Number,
    Object,
    Array,
    URL,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    CustomEvent:class{constructor(type,args){this.type=type;this.detail=args?.detail;}},
    localStorage:{getItem:key=>localStorage.get(key)||null,setItem:(key,value)=>localStorage.set(key,value)}
  });

  let client=read('cloudbase-client.js')
    .replace(/const PUBLISHABLE_KEY\s*=\s*'[^']*'/,"const PUBLISHABLE_KEY = 'TEST_ONLY_PUBLIC_KEY'");
  vm.runInContext(client,context);

  // 超时与退避改成毫秒级：测的是「有没有这套机制」，不是「到底等了 12 秒」
  let storage=read('storage.js')
    .replace(/const SYNC_TIMEOUT_MS = \d+;/,'const SYNC_TIMEOUT_MS = 40;')
    .replace(/const SYNC_BACKOFF_MS = \d+;/,'const SYNC_BACKOFF_MS = 10;')
    .replace(/const RETRY_MIN_MS = \d+;/,'const RETRY_MIN_MS = 40;')
    .replace(/const RETRY_MAX_MS = \d+;/,'const RETRY_MAX_MS = 80;');

  vm.runInContext(storage,context);

  const cloud=window.CalcDailyCloud;

  window.addEventListener('calcdaily:sync-status',event=>statuses.push(event.detail));

  const user={id:'user-1',email:'student@example.test',user_metadata:{displayName:'小陈'}};
  cloud.setUser(user);

  return {
    cloud,window,records,calls,statuses,state,

    /* 引导完成之后再注入故障：resolveAfterSignIn 自己也会走一遍写入，
       一开始就注入会让「引导阶段先失败」而不是「被测的那一步失败」。 */
    fail(table,message,times=9){
      state.failures.push({table,message,times,left:times});
    },
    goOffline(){
      window.navigator.onLine=false;
    },
    goOnline(){
      window.navigator.onLine=true;
      window.dispatchEvent({type:'online'});
    },
    statusNames(){return statuses.map(item=>item.status);},
    lastStatus(){return statuses[statuses.length-1]||null;}
  };
}

const seedState=()=>({
  stats:{attempts:1,correct:1,byModule:{},byTopic:{}},
  history:[{id:'h1',module:'limit',at:new Date().toISOString()}],
  reviews:[],
  checkins:[],
  settings:{difficultyMode:'adaptive',trainingMode:'balanced',dailyCount:10,manualLevels:{}},
  profile:{abilityByModule:{limit:6},displayLevelByModule:{limit:6},confidenceByModule:{limit:.2},effectiveAttemptsByModule:{limit:1},diagnosed:false,placementSource:'default'},
  _meta:{localUpdatedAt:new Date().toISOString()}
});

const tick=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/* =========================================================
   1. 卡住云请求不会把同步链卡死
   ========================================================= */

test('★ 云请求卡住时必须有超时，且超时后队列要释放',async()=>{
  const h=harness();

  h.state.hang=true;

  const started=Date.now();
  await assert.rejects(h.cloud.resolveAfterSignIn(seedState()),/超时/);
  const elapsed=Date.now()-started;

  assert.ok(elapsed<2000,`卡住的请求 ${elapsed}ms 才被放弃 —— 同步链会被它一直占住`);
  assert.equal(h.cloud.getSyncState().lastError?.includes('超时'),true,
    '超时必须被记下来，否则界面只能显示「正在同步」');

  // 卡住的那一次过去之后，同步必须还能继续走
  h.state.hang=false;
  await h.cloud.resolveAfterSignIn(seedState());

  assert.equal(h.cloud.getSyncState().lastError,null);
  assert.equal(h.statusNames().includes('synced'),true);
});

/* =========================================================
   2. 瞬时错误重试，永久错误不重试
   ========================================================= */

test('★ 瞬时错误（网络类）要重试一次并成功',async()=>{
  const h=harness({
    failures:[{table:'profiles',message:'NetworkError: fetch failed',times:1}]
  });

  await h.cloud.resolveAfterSignIn(seedState());

  const syncState=h.cloud.getSyncState();
  assert.equal(syncState.stats.retries,1,'瞬时错误没有重试 —— 一次抖动就被记成一次失败');
  assert.equal(syncState.lastError,null);
  assert.equal(h.statusNames().includes('synced'),true);

  const profileCalls=h.calls.filter(call=>call.table==='profiles');
  assert.equal(profileCalls.length,2,'第一次失败 + 重试成功 = 两次调用');
});

test('★ 永久性错误不重试：试再多次也是同一个结果',async()=>{
  const h=harness({
    failures:[{table:'profiles',message:'permission denied for table profiles',times:9}]
  });

  await assert.rejects(h.cloud.resolveAfterSignIn(seedState()),/permission denied/);

  const syncState=h.cloud.getSyncState();
  assert.equal(syncState.stats.retries,0,'权限错误被当成瞬时错误重试了');
  assert.equal(syncState.stats.failures,1);
});

test('★ 失败之后状态必须放回队列，而不是等用户下一次操作',async()=>{
  const h=harness({
    failures:[{table:'profiles',message:'NetworkError: fetch failed',times:99}]
  });

  await assert.rejects(h.cloud.resolveAfterSignIn(seedState()));

  const syncState=h.cloud.getSyncState();
  assert.equal(syncState.pending,true,'失败的状态被丢掉了 —— 这一次的记录要等到用户下次操作才可能补上');
  assert.equal(syncState.retryScheduled||syncState.retryDelayMs>0,true);

  // 故障恢复之后，补发能把记录真正写上去
  h.state.failures.length=0;
  await h.cloud.flushPending();

  assert.equal(h.cloud.getSyncState().lastError,null);
  assert.ok((h.records.user_state||[]).length>0,'恢复之后记录没有真的写上去');
});

/* =========================================================
   3. 离线 → 在线
   ========================================================= */

test('★ 断网时不发注定超时的请求，记录留在队列里',async()=>{
  const h=harness();
  await h.cloud.resolveAfterSignIn(seedState());

  h.goOffline();
  const before=h.calls.length;

  h.cloud.queueSync(seedState());

  await tick(60);

  assert.equal(h.calls.length,before,'断网时还是发了请求 —— 它只会以超时收场，还占住串行链');
  assert.equal(h.cloud.getSyncState().pending,true);
  assert.equal(h.lastStatus().status,'offline');
});

test('★ 恢复联网后自动补同步（离线→在线恢复）',async()=>{
  const h=harness();
  await h.cloud.resolveAfterSignIn(seedState());

  h.goOffline();

  const offlineState=seedState();
  offlineState.history.push({id:'h2',module:'integral',at:new Date().toISOString()});
  h.cloud.queueSync(offlineState);

  assert.equal(h.cloud.getSyncState().pending,true);

  // 用户重新连上网
  h.goOnline();

  await tick(120);

  const syncState=h.cloud.getSyncState();
  assert.equal(syncState.pending,false,'联网恢复后队列没有被冲刷');
  assert.equal(syncState.online,true);
  assert.ok(syncState.stats.recoveries>=1);
  assert.equal(h.statusNames().includes('synced'),true);

  const attemptRows=(h.records.attempts||[]).map(row=>row.id);
  assert.ok(attemptRows.includes('h2'),'断网期间的作答没有补上去 —— 用户会以为记录丢了');
});

/* =========================================================
   4. 清空是破坏性操作：宁可报错，不能假装成功
   ========================================================= */

test('★ 清空时某张表卡住 → 必须抛出，而不是静默返回成功',async()=>{
  const h=harness();
  await h.cloud.resolveAfterSignIn(seedState());

  h.state.hang=true;

  await assert.rejects(h.cloud.resetRemote(),/超时/);

  // 卡住的表之后的表一张都不该被删 —— 半途而废的清空比明确失败更危险
  h.state.hang=false;
  assert.equal(h.cloud.getSyncState().pending,false);
});

test('清空失败之后仍然可以继续同步（resetting 必须被释放）',async()=>{
  const h=harness();
  await h.cloud.resolveAfterSignIn(seedState());

  h.fail('attempts','permission denied');

  await assert.rejects(h.cloud.resetRemote(),/清空 attempts 失败/);

  // 卡在 resetting=true 会让此后所有同步静默失效
  h.state.failures.length=0;
  await h.cloud.syncNow(seedState(),{full:true});
  assert.equal(h.cloud.getSyncState().lastError,null);
});

/* =========================================================
   5. 可观测性
   ========================================================= */

test('同步状态必须可读：pending / 退避 / 在线 / 失败统计',async()=>{
  const h=harness();
  await h.cloud.resolveAfterSignIn(seedState());

  const state=h.cloud.getSyncState();

  for(const key of ['pending','retryDelayMs','lastSyncAt','lastError','online','stats']){
    assert.ok(key in state,`同步状态缺字段 ${key}`);
  }

  for(const key of ['attempts','retries','timeouts','failures','recoveries']){
    assert.ok(key in state.stats,`同步统计缺字段 ${key}`);
  }

  assert.equal(state.lastError,null);
  assert.ok(state.lastSyncAt,'成功同步之后必须记下时间');
});
