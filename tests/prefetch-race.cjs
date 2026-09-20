'use strict';

/* =========================================================
   Task 5E：预取竞态防护
   =========================================================

   预取的模型是「提前把下一题生成好」，它天然有三个时间差：
   两轮预取抢同一个位置、模型返回要几十秒、失效的响应落地得比新响应还晚。

   这一组把三条闸门全部钉死：
     · 旧请求不许覆盖新请求（A 先发、B 后发、A 后落地 → 保留 B）
     · 取用时 await **前后各核对一次**（期间会话可能已经往前走）
     · 任何一条对不上，宁可丢弃重新生成，也不把题错位塞给用户
   ========================================================= */

const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const Q=require('../math-quality');
const support=require('../tools/test-support.cjs');

/* 每个 harness 都留着一个「本测试创建过的 deferred」列表。测试跑完后统一结算，
   否则没被 resolve 的那条 promise 链会被测试运行器判成「还有异步没收尾」，
   把后面的用例一起拖成 cancelledByParent —— 报错位置与实际原因完全对不上。 */
let current=null;

afterEach(()=>{current?.drain();current=null;});

function deferred(){
  let resolve;
  const promise=new Promise(r=>{resolve=r;});
  return {promise,resolve};
}

function harness(){
  const source=support.read('app.js');
  const fn=support.appSlice(source);

  const generated=[];          // generateOneQuestion 的调用记录
  const sideEffects=[];        // applyPlanSideEffects 的调用记录
  const queue=[];              // 每次出题对应的 deferred

  const sessionPrefetch=new Map();

  const context=vm.createContext({
    MathQuality:Q,
    ...support.diagContextBits(source),
    sessionPrefetch,
    warmupPrefetch:{daily:null,diagnosis:null},

    generateOneQuestion(plan,meta){
      const slot=deferred();
      generated.push({plan,meta,slot});
      queue.push(slot);
      return slot.promise;
    },

    previewPlanForSession:session=>session.plans[0],

    applyPlanSideEffects(session,plan){sideEffects.push(plan);},

    generationFingerprint:mode=>`fp:${mode}`,

    console:{log(){},warn(){},error(){}}
  });

  for(const name of [...support.DIAG_FUNCTIONS,'nextRequestId','prefetchSupersedes','discardPrefetch','plansCompatible','consumeSessionPrefetch','scheduleSessionPrefetch','consumeWarmup']){
    vm.runInContext(fn(name),context);
  }

  const api={
    c:context,generated,sideEffects,sessionPrefetch,queue,

    drain(){
      while(queue.length){
        const slot=queue.shift();
        slot.resolve(null);
      }
    }
  };

  current=api;

  return api;
}

const plan=(over={})=>({module:'limit',topic:'重要极限',targetDifficulty:over.targetDifficulty??6,purpose:'daily',zone:'daily',reviewId:null,...over});

/* 默认是「一组正在进行中的题」：有一道当前题、还没有作答记录
   （scheduleSessionPrefetch 对「还没开始」的空会话会直接返回 —— 那种情况
   由预热负责，见最后一组测试）。 */
const sessionOf=(over={})=>({id:'sess-1',mode:'daily',total:10,results:[],currentQuestion:{id:'current-q'},completed:false,plans:[plan()],...over});

const stale=records=>records.filter(r=>r.kind==='stale_response');

/* =========================================================
   1. 先后顺序：谁更新，谁说了算
   ========================================================= */

test('★ 预取 A 先发、B 后发、A 后落地 —— 必须保留 B',async()=>{
  const {c,generated}=harness();
  const session=sessionOf();

  // 第一次预取（计划 P1）
  c.scheduleSessionPrefetch(session);
  // 计划变了（用户改了难度/考点，或作答落地导致计划重算），再来一次
  session.plans=[plan({targetDifficulty:9})];
  c.scheduleSessionPrefetch(session);

  assert.equal(generated.length,2,'两次不同计划的预取都该发出请求');

  const [a,b]=generated;

  // B 先返回，A 后返回 —— 也就是「旧请求落地得更晚」
  b.slot.resolve({id:'B-question'});
  a.slot.resolve({id:'A-question'});

  const question=await c.consumeSessionPrefetch(session,plan({targetDifficulty:9}));

  assert.equal(question.id,'B-question','旧请求覆盖了新请求 —— 用户会拿到上一版计划生成的题');
});

test('★ 旧请求不许写回缓存：题号更靠后的请求优先',()=>{
  const {c,sessionPrefetch}=harness();
  const session=sessionOf({results:[{module:'limit'},{module:'limit'}]});

  // 先按「第 3 题」发一轮
  session.plans=[plan({targetDifficulty:5})];
  c.scheduleSessionPrefetch(session);
  const newer=sessionPrefetch.get(session.id).request_id;
  const newerSeq=sessionPrefetch.get(session.id).question_sequence;

  // 再按「第 2 题」发一轮（例如另一条路径用了旧的会话快照）
  session.results=session.results.slice(0,1);
  session.plans=[plan({targetDifficulty:7})];
  c.scheduleSessionPrefetch(session);

  const entry=sessionPrefetch.get(session.id);
  assert.equal(entry.question_sequence,newerSeq,'旧题号的请求把新请求顶掉了');
  assert.equal(entry.request_id,newer);
});

test('同一题号、同一计划不会重复请求',()=>{
  const {c,generated}=harness();
  const session=sessionOf();

  c.scheduleSessionPrefetch(session);
  c.scheduleSessionPrefetch(session);

  assert.equal(generated.length,1);
});

/* =========================================================
   2. 取用时的两道核对
   ========================================================= */

test('★ await 期间会话往前走了 —— 必须丢弃，不能把题错位塞进去',async()=>{
  const h=harness();
  const session=sessionOf();

  h.c.scheduleSessionPrefetch(session);
  const pending=h.c.consumeSessionPrefetch(session,plan());

  // 取用已经开始 await 了。用户在这几十秒里交了卷：题号从 0 变成 1。
  session.results.push({module:'limit'});

  // 模型这才返回。只检查 await 之前的实现在这里会把题错位塞给用户。
  h.queue[0].resolve({id:'A-question'});

  const question=await pending;

  assert.equal(question,null,'题号已经变了，这道题不能再落到这个位置上');
  assert.ok(stale(h.c.diagRecords).some(r=>r.message==='sequence_changed_during_wait'),
    '丢弃必须留下 STALE_RESPONSE 记录，并写清是哪一种错配');
});

test('★ await 期间会话结束了 —— 必须丢弃',async()=>{
  const h=harness();
  const session=sessionOf();

  h.c.scheduleSessionPrefetch(session);
  const pending=h.c.consumeSessionPrefetch(session,plan());

  h.queue[0].resolve({id:'A-question'});
  session.completed=true;

  assert.equal(await pending,null);
  assert.ok(stale(h.c.diagRecords).length);
});

test('★ 取用前题号就已经对不上 —— 直接丢弃，不消耗一次等待',async()=>{
  const h=harness();
  const session=sessionOf();

  h.c.scheduleSessionPrefetch(session);

  // 题号在「取用之前」就已经前进了（例如上一题的记录刚落库）。
  // 这时连等都不该等 —— 预取的那道题已经不对应这个位置。
  session.results.push({module:'limit'});

  const question=await h.c.consumeSessionPrefetch(session,plan());

  assert.equal(question,null);
  assert.ok(stale(h.c.diagRecords).some(r=>r.message==='sequence_advanced_before_wait'),
    '取用前就该发现题号对不上');

  h.drain();
});

test('★ 预取属于另一组题 —— 不得跨会话取用',async()=>{
  const h=harness();
  const session=sessionOf();
  const other=sessionOf({id:'sess-2'});

  h.c.scheduleSessionPrefetch(session);
  const entry=h.sessionPrefetch.get(session.id);
  // 人为把它挪到另一组的键上：模拟会话被替换、缓存键复用
  h.sessionPrefetch.set(other.id,entry);

  const pending=h.c.consumeSessionPrefetch(other,plan());
  h.queue[0].resolve({id:'A-question'});

  assert.equal(await pending,null);
  assert.ok(stale(h.c.diagRecords).some(r=>r.message==='session_mismatch'));
});

test('计划不一致时必须丢弃（题面与计划错配比没有预取更糟）',async()=>{
  const h=harness();
  const session=sessionOf();

  h.c.scheduleSessionPrefetch(session);
  const pending=h.c.consumeSessionPrefetch(session,plan({targetDifficulty:11}));

  h.queue[0].resolve({id:'A-question'});

  assert.equal(await pending,null);
  assert.ok(stale(h.c.diagRecords).some(r=>r.message==='plan_mismatch'));
});

test('一切正常时预取照常生效（闸门不能把好路径也拦掉）',async()=>{
  const h=harness();
  const session=sessionOf();

  h.c.scheduleSessionPrefetch(session);
  const pending=h.c.consumeSessionPrefetch(session,plan());

  h.queue[0].resolve({id:'A-question',module:'limit'});

  const question=await pending;

  assert.equal(question.id,'A-question');
  assert.equal(question.zone,'daily');
  assert.equal(h.sideEffects.length,1,'计划的副作用必须在确认采用之后才施加');
});

/* =========================================================
   3. 请求身份确实发到了服务端
   ========================================================= */

test('每次预取都带 request_id / session_id / question_sequence',()=>{
  const h=harness();
  const session=sessionOf({results:[{module:'limit'},{module:'limit'}]});

  h.c.scheduleSessionPrefetch(session);

  const sent=h.generated[0];
  assert.match(sent.meta.request_id,/^prefetch-/);
  assert.equal(sent.meta.session_id,session.id);
  assert.equal(sent.meta.question_sequence,2,'题号必须是这一组的第几题，而不是随便一个计数');

  // 身份之间必须互不相同，否则「对不上就丢弃」这条闸门形同虚设
  const session2=sessionOf({id:'sess-9'});
  h.c.scheduleSessionPrefetch(session2);
  assert.notEqual(h.generated[1].meta.request_id,sent.meta.request_id);
});

/* =========================================================
   4. 预热（第一题）
   ========================================================= */

test('★ 预热不得落到已经有进度的会话上',async()=>{
  const h=harness();
  const session=sessionOf({currentQuestion:{id:'already-there'},results:[{module:'limit'}]});

  h.c.warmupPrefetch.daily={
    fingerprint:'fp:daily',
    plan:plan(),
    request_id:'warmup-1',
    slot:null,
    promise:Promise.resolve({question:{id:'warm-question'},plan:plan()})
  };

  const question=await h.c.consumeWarmup('daily',session);

  assert.equal(question,null,'会话已经有题了，预热不该再插一道进去');
  assert.ok(stale(h.c.diagRecords).some(r=>r.message==='warmup_session_no_longer_empty'));
});

test('预热正常生效：空会话拿到第一题',async()=>{
  const h=harness();
  const session=sessionOf({currentQuestion:null});

  h.c.warmupPrefetch.daily={
    fingerprint:'fp:daily',
    plan:plan(),
    request_id:'warmup-1',
    promise:Promise.resolve({question:{id:'warm-question'},plan:plan()})
  };

  const question=await h.c.consumeWarmup('daily',session);

  assert.equal(question.id,'warm-question');
  assert.equal(h.sideEffects.length,1);
});

test('预热只认同一份指纹：设置变了就作废',async()=>{
  const h=harness();
  const session=sessionOf({currentQuestion:null});

  h.c.warmupPrefetch.daily={
    fingerprint:'fp:OLD',
    plan:plan(),
    promise:Promise.resolve({question:{id:'warm-question'},plan:plan()})
  };

  assert.equal(await h.c.consumeWarmup('daily',session),null);
});
