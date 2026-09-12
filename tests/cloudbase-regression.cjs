'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const copy = x => JSON.parse(JSON.stringify(x));
const tick = () => new Promise(r => setTimeout(r, 5));
function deferred() { let resolve; const promise = new Promise(r => resolve = r); return {promise,resolve}; }
function harness({configured = true} = {}) {
  const listeners = {}, elements = {}, records = {}, calls = [];
  const user = {id:'cloudbase-user-1234567890',email:'student@example.test',user_metadata:{nickName:'小陈'}};
  let session = null, authCallback = () => {}, verificationUser = false;
  let failTable = null, gateTable = null, gate = null;
  function eventTarget() {
    const events = {};
    return { addEventListener(k, fn) { (events[k] ||= []).push(fn); },
      async fire(k) { for (const fn of events[k] || []) await fn({preventDefault(){}}); } };
  }
  for(const id of [...read('index.html').matchAll(/id="([^"]+)"/g)].map(x=>x[1])) {
    const set = new Set();
    elements[id] = {...eventTarget(),value:'',textContent:'',disabled:false,
      classList:{add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x),toggle(x,v){if(v)set.add(x);else set.delete(x);}},
      reportValidity(){return this.value.includes('@');}};
  }
  const document = {...eventTarget(),readyState:'loading',activeElement:null,getElementById:id=>elements[id] || null};
  const db = {from(table) {
    let op='select', body, filters={}, opts={};
    const q = {
      select(){return q;},eq(k,v){filters[k]=v;return q;},maybeSingle(){return q;},
      upsert(value,options){op='upsert';body=copy(value);opts=options;return q;},delete(){op='delete';return q;},
      then(resolve,reject){return (async()=>{
        calls.push({table,op,body,filters:copy(filters),opts});
        if(table===gateTable && gate){const wait=gate;gate=null;await wait.promise;}
        if(table===failTable) return {error:{message:'simulated database error'},data:null};
        const rows=records[table] ||= [];
        if(op==='select') return {error:null,data:rows.find(r=>r.user_id===filters.user_id)||null};
        if(op==='delete') records[table]=rows.filter(r=>r.user_id!==filters.user_id);
        if(op==='upsert') for(const row of [].concat(body)){
          const keys=opts.onConflict.split(',');const i=rows.findIndex(old=>keys.every(k=>old[k]===row[k]));
          if(i<0)rows.push(row);else rows[i]={...rows[i],...row};
        }
        return {data:null,error:null};
      })().then(resolve,reject);}
    };return q;
  }};
  const sdkAuth = {
    async getSession(){return {data:{session},error:null};},
    onAuthStateChange(cb){authCallback=cb;return {data:{subscription:{unsubscribe(){}}}};},
    async signInWithPassword(params){calls.push({auth:'password',params});session={user:copy(user)};authCallback('SIGNED_IN',session);return {data:{session,user:session.user},error:null};},
    async signOut(){session=null;authCallback('SIGNED_OUT',null);return {error:null};},
    async getVerification(params){calls.push({auth:'send',params});return {verification_id:'message-1',is_user:verificationUser};},
    async verify(params){calls.push({auth:'verify',params});if(params.verification_code!=='123456')throw Error('验证码错误');return {verification_token:'proof-token'};},
    async signUp(params){calls.push({auth:'signup',params});user.user_metadata.nickName=params.name;session={user:copy(user)};authCallback('SIGNED_IN',session);return {user:session.user};},
    async updateUser(params){calls.push({auth:'update',params});user.user_metadata.nickName=params.nickname;session={user:copy(user)};authCallback('USER_UPDATED',session);return {data:{user:copy(user)},error:null};}
  };
  const local = new Map();
  const window = {fetch:async()=>{throw Error('Unexpected network');},location:{origin:'http://localhost'},cloudbase:{init(){return {auth:sdkAuth,rdb(){return db;}};}},
    addEventListener(k,fn){(listeners[k] ||= []).push(fn);},dispatchEvent(e){for(const f of listeners[e.type]||[])f(e);},
    CalcDailyApp:{applyCloudState(s){local.set('calcDaily.v2',JSON.stringify(s));},getState(){return JSON.parse(local.get('calcDaily.v2')||'{}');}}};
  const context=vm.createContext({window,document,console,Date,URL,URLSearchParams,
    setTimeout,clearTimeout,queueMicrotask,setInterval:(fn,ms)=>{const t=setInterval(fn,ms);t.unref();return t;},clearInterval,
    localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},
    CustomEvent:class{constructor(type,args){this.type=type;this.detail=args.detail;}}});
  let source=read('cloudbase-client.js');
  source=source.replace(/const PUBLISHABLE_KEY\s*=\s*'[^']*'/, "const PUBLISHABLE_KEY = '"+(configured?'TEST_ONLY_PUBLIC_KEY':'YOUR_CLOUDBASE_PUBLISHABLE_KEY_HERE')+"'");
  vm.runInContext(source,context);vm.runInContext(read('storage.js'),context);vm.runInContext(read('auth.js'),context);
  return {window,document,elements,calls,records,local,user,
    fail(table){failTable=table;},block(table){gateTable=table;gate=deferred();return gate;},
    existing(){verificationUser=true;},setSession(s){session=s;},emit(event,s){session=s;authCallback(event,s);}};
}
const tests=[];const test=(name,fn)=>tests.push({name,fn});
test('占位符保持游客模式，注册入口仍可打开',async()=>{
 const h=harness({configured:false});await h.document.fire('DOMContentLoaded');
 assert.equal(h.window.CalcDailyCloudBase.configured,false);assert.equal(h.window.CalcDailyCloud.getUser(),null);
 await h.elements.authRegisterTab.fire('click');assert.equal(h.elements.authCodeInput.required,true);
 assert.equal(h.elements.authSendCodeBtn.disabled,true);assert.equal(h.elements.authSubmitBtn.textContent,'创建账号');assert.equal(h.calls.length,0);
});
test('匿名会话不当成登录账号，不触发数据库请求',async()=>{
 const h=harness();h.setSession({user:{id:'anon-1',is_anonymous:true}});await h.document.fire('DOMContentLoaded');
 assert.equal(h.window.CalcDailyCloud.getUser(),null);assert.equal(h.calls.length,0);
});
test('八张表同步、游客进度合并、本机进行中练习不上传',async()=>{
 const h=harness(),cloud=h.window.CalcDailyCloud;cloud.setUser(h.user);
 const state={activeSession:{id:'local-only'},stats:{attempts:1,byTopic:{a:{module:'limit',topic:'极限',attempts:1}}},history:[{id:'h1',module:'limit'}],reviews:[{id:'r1',module:'limit'}],checkins:['2026-09-07']};
 await cloud.resolveAfterSignIn(state);
 assert.deepEqual(Object.keys(h.records).sort(),['profiles','user_state','user_settings','module_progress','topic_progress','attempts','review_queue','checkins'].sort());
 assert.equal(h.records.user_state[0].state_json.activeSession,null);assert.equal(cloud.consumePendingState().activeSession.id,'local-only');
 assert.equal(h.records.user_state[0].state_json._meta.cloudUserId,h.user.id);
});
test('切换账号不合并前一账号的本地数据',async()=>{
 const h=harness(),cloud=h.window.CalcDailyCloud;cloud.setUser(h.user);
 const merged=await cloud.resolveAfterSignIn({_meta:{cloudUserId:'another-user'},stats:{attempts:100},history:[{id:'private'}]});
 assert.equal(merged.history,undefined);assert.equal(h.records.attempts,undefined);
});
test('正在读取云端时退出登录，不应用过期会话的学习状态',async()=>{
 const h=harness();await h.document.fire('DOMContentLoaded');const gate=h.block('user_state');h.emit('SIGNED_IN',{user:h.user});await tick();h.emit('SIGNED_OUT',null);await tick();gate.resolve();await tick();
 assert.equal(h.window.CalcDailyCloud.getUser(),null);assert.equal(h.local.has('calcDaily.v2'),false);
});
test('清空等待在途同步结束，取消延迟同步，保留账号 profiles',async()=>{
 const h=harness(),cloud=h.window.CalcDailyCloud;cloud.setUser(h.user);await cloud.resolveAfterSignIn({stats:{attempts:1},history:[{id:'h1'}]});
 const gate=h.block('user_state');const running=cloud.syncNow({stats:{attempts:2}}).catch(()=>{});await tick();
 cloud.queueSync({stats:{attempts:3}});const reset=cloud.resetRemote();gate.resolve();await running;await reset;await new Promise(r=>setTimeout(r,950));
 assert.equal(h.records.profiles.length,1);for(const table of ['attempts','review_queue','checkins','topic_progress','module_progress','user_settings','user_state'])assert.equal(h.records[table].length,0,table);
 const firstDelete=h.calls.findIndex(c=>c.op==='delete');assert.equal(h.calls.slice(firstDelete).some(c=>c.op==='upsert'),false);
});
test('云端删除失败必须抛出，原有 app.js 可阻止本地清空',async()=>{
 const h=harness(),cloud=h.window.CalcDailyCloud;cloud.setUser(h.user);h.fail('attempts');await assert.rejects(cloud.resetRemote(),/清空 attempts 失败/);
});
test('首次读云失败不写入，手动重试先读取再恢复同步',async()=>{
 const h=harness(),cloud=h.window.CalcDailyCloud;cloud.setUser(h.user);h.fail('user_state');
 await assert.rejects(cloud.resolveAfterSignIn({stats:{attempts:1}}),/读取云端学习状态失败/);
 assert.equal(h.calls.some(c=>c.op==='upsert'),false);
 h.fail(null);await cloud.syncNow({stats:{attempts:2}});
 assert.equal(h.calls.filter(c=>c.op==='select').length,2);assert.equal(h.records.user_state[0].state_json.stats.attempts,2);
});
test('并发手动同步的 Promise 等待各自写入完成',async()=>{
 const h=harness(),cloud=h.window.CalcDailyCloud;cloud.setUser(h.user);
 await cloud.resolveAfterSignIn({});
 const a=cloud.syncNow({stats:{attempts:1}}),b=cloud.syncNow({stats:{attempts:2}});assert.equal(await a,true);assert.equal(await b,true);assert.equal(h.records.user_state[0].state_json.stats.attempts,2);
});
(async()=>{for(const {name,fn} of tests){await fn();console.log('PASS '+name);}console.log(`${tests.length} regression checks passed.`);})().catch(error=>{console.error(error);process.exitCode=1;});
