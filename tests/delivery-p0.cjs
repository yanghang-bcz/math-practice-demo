'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const referenceRoot=process.env.CALCDAILY_TEST_ROOT;
const Q=require(referenceRoot ? path.join(referenceRoot,'math-quality.js') : '../math-quality');
const support=require('../tools/test-support.cjs');
if(referenceRoot) support.read=file=>fs.readFileSync(path.join(referenceRoot,file),'utf8');
const source=support.read('app.js'), fn=support.appSlice(source);
const silent={log(){},warn(){},error(){}};
function backend(file='api/deepseek.js') {
 const c=vm.createContext({require:createRequire(path.resolve(referenceRoot || '.',file)),module:{exports:{}},process:{env:{DEEPSEEK_API_KEY:'test'}},console:silent,AbortController,AbortSignal,URL,setTimeout,clearTimeout,fetch:async()=>{throw Error('unexpected network')}});
 vm.runInContext(support.read(file).replace("server.listen(PORT, '0.0.0.0', () => {","if(false) server.listen(PORT, '0.0.0.0', () => {"),c);return c;
}
function client(names,extra={}) {
 const c=vm.createContext({...support.diagContextBits(source),console:silent,MathQuality:Q,Date,Math,AbortController,setTimeout,clearTimeout,
  sessionPrefetch:new Map(),warmupPrefetch:{daily:null,diagnosis:null},
  ...Object.fromEntries(['API_TIMEOUTS','API_RETRY','API_BUDGETS'].map(k=>[k,support.constObjectFrom(source,k)])),
  RETRY_BASE_MS:600,RETRY_JITTER_MS:600,AI_API_URL:'https://local.test',sleep:async()=>{}, ...extra});
 for(const n of [...support.DIAG_FUNCTIONS,'nextRequestId',...names]) {
  if(referenceRoot && n==='ensureCurrentQuestionOwned') continue;
  vm.runInContext(fn(n),c);
 }
 return c;
}
const draft={module:'derivative',instruction:'求导',topic:'求导',expression:'y=x^2',answer:'2x',solution:'对幂函数求导。'};
const review=q=>({...Object.fromEntries(Q.fields.map(k=>[k,true])),confidence:.99,status:'approved',version:Q.VERSION,content:Q.content(q),independent_answer:q.answer});
function gated(q){return {...q,verification:review(q)}}
const rows=require('./fixtures/delivery/math-probe-results.json').rows;
for(const r of rows) test('audit mathematics: '+r.name,()=>{
 const q={...draft,...r.question};q.verification=review(q);
 const expected=r.name.startsWith('point_value')?'uncertain':r.name==='wrong_answer_control'?'not_equivalent':'equivalent';
 assert.equal(Q.verifyAnswerAgainstQuestion(q,q.answer),expected);
 assert.equal(Q.gateApproved(q),expected==='equivalent');
 if(expected==='equivalent') {
  const bad={...q,answer:`-(${q.answer.replace(/\+C$/,'')})`};bad.verification=review(bad);
  assert.equal(Q.gateApproved(bad),false,'sign error must never pass');
 }
});
test('final solution contradiction still rejected; intermediate limits are not final',()=>{
 const q={...draft,module:'limit',expression:'\\lim_{x\\to0}(\\frac{\\sin x}{x}+x)',answer:'1'};
 assert.equal(Q.issues({...q,solution:'第一项极限为 \\(1\\)，第二项极限为 \\(0\\)，因此原极限为 \\(1\\)。'}).length,0);
 assert.ok(Q.issues({...q,solution:'第一项极限为 \\(1\\)，最终答案为 \\(0\\)。'}).includes('SOLUTION_MISMATCH'));
});
test('unknown subscripts, ambiguous inverse, implicit and invalid domains remain UNCERTAIN',()=>{
 for(const expression of ['y=x_1^2','y=\\log_a x','y=\\cos^{-1}x','x^2+xy+y^2=1','y=\\ln(-x^2-1)','y=\\unknown(x)'])
 assert.equal(Q.verifyAnswerAgainstQuestion({...draft,expression},'2x'),'uncertain',expression);
});
for(const file of ['api/deepseek.js','cloudbase/deepseek/index.js']) {
 test(file+': quality business contract; true internal failure retains 500',()=>{
  const c=backend(file), body={action:'generate',request_id:'business-id'};
  const result=c.failureResponse(Object.assign(Error('rejected'),{code:'GENERATION_REJECTED',gateState:'REJECTED'}),body);
  assert.equal(result.status,422);assert.equal(result.data.retryable,false);assert.equal(result.data.report_service_error,false);assert.equal(result.data.request_id,body.request_id);
  assert.equal(c.failureResponse(Error('internal'),body).status,500);
  for(const [code,stage] of [['UPSTREAM_TIMEOUT','timeout'],['UPSTREAM_UNREACHABLE','network'],['UPSTREAM_PROTOCOL_ERROR','format'],['UPSTREAM_REJECTED','model'],['GENERATION_UNVERIFIED','quality']])assert.equal(c.failureResponse(Object.assign(Error('failure'),{code}),body).data.stage,stage);
 });
 test(file+': unauthorized/bad request never outer-retried',async()=>{
  for(const statusCode of [400,401,403]){
   const c=backend(file);let calls=0;c.generateDraftQuestions=async()=>{calls++;throw Object.assign(Error('reject'),{code:'UPSTREAM_REJECTED',statusCode})};
   await assert.rejects(c.generateQuestions('mock',{}),e=>e.statusCode===statusCode);assert.equal(calls,1);
  }
 });
 test(file+': shared absolute deadline controls a stalled operation',async()=>{
  const c=backend(file);const start=Date.now();
  assert.equal(vm.runInContext('REQUEST_BUDGET_MS',c),30000);
  await assert.rejects(c.withinBudget({budget_ms:35},()=>new Promise(()=>{})),e=>e.code==='UPSTREAM_TIMEOUT');
  assert.ok(Date.now()-start<500);
 });
 test(file+': body timeout and disconnect are not JSON errors',async()=>{
  const c=backend(file);
  for(const name of ['AbortError','TimeoutError','TypeError']){
   c.fetch=async()=>({ok:true,status:200,text:async()=>{throw Object.assign(Error('body'),{name})}});
   await assert.rejects(c.callDeepSeekOnce('x',[],20,.1,50,'generate'),e=>e.code===(name==='TypeError'?'UPSTREAM_UNREACHABLE':'UPSTREAM_TIMEOUT'));
  }
 });
}
test('real handler returns structured quality failure with request identity',async()=>{
 const c=backend();c.generateDraftQuestions=async()=>({questions:[{...draft,answer:'3x'}]});
 let status, data;const res={setHeader(){},status(s){status=s;return this},json(d){data=d;return this}};
 await c.module.exports({method:'POST',body:{action:'generate',request_id:'http-test'}},res);
 assert.equal(status,422);assert.equal(data.code,'GENERATION_REJECTED');assert.equal(data.attempt_history.length,2);assert.equal(data.request_id,'http-test');
});
const apiNames=['retryDelay','apiTimeoutError','apiFailureKind','apiRetryable','apiCall'];
test('legacy HTTP500 quality failures are not retried or classified as a connection problem',async()=>{
 let count=0;const c=client(apiNames,{fetch:async()=>{count++;return {ok:false,status:500,json:async()=>({code:'GENERATION_REJECTED',error:'gate'})}}});
 await assert.rejects(c.apiCall('generate'),e=>{assert.equal(c.apiFailureKind('generate',e),'generate_rejected');return true});assert.equal(count,1);
});
test('client body abort preserves timeout; generation network error is not automatically resubmitted',async()=>{
 const c=client(apiNames,{fetch:async()=>({ok:true,status:200,json:async()=>{throw Object.assign(Error('body timeout'),{name:'AbortError'})}})});
 await assert.rejects(c.apiCall('generate'),e=>e.code==='CLIENT_TIMEOUT');
 let calls=0;c.fetch=async()=>{calls++;throw new TypeError('offline')};
 await assert.rejects(c.apiCall('generate'));assert.equal(calls,1);assert.equal(c.apiFailureKind('generate',new TypeError('offline')),'generate_network');
});
const plan={module:'derivative',topic:'复合函数求导',targetDifficulty:6,purpose:'daily'};
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve(v){resolve(v)}}};
function session(){return {id:'s',mode:'daily',results:[],total:10,currentQuestion:null,completed:false}}
test('two foreground ensures share one generation and cannot overwrite a committed fallback',async()=>{
 const s=session(),d=deferred();let calls=0,renders=0;
 const c=client(['ensureCurrentQuestion','ensureCurrentQuestionOwned'],{state:{activeSession:s},sessionContainerId:()=>'',renderSessionLoading(){},makeDailyPlan:()=>plan,consumeSessionPrefetch:async()=>null,generateOneQuestion(){calls++;return d.promise},saveState(){},renderActiveSession(){renders++}});
 const a=c.ensureCurrentQuestion(s),b=c.ensureCurrentQuestion(s);await new Promise(r=>setImmediate(r));assert.equal(calls,1);
 s.currentQuestion={id:'fallback-committed',source:'fallback'};d.resolve({id:'late-ai',source:'ai'});await Promise.all([a,b]);assert.equal(s.currentQuestion.id,'fallback-committed');assert.equal(renders,0);
});
test('new session and advanced sequence discard old frontend response',async()=>{
 for(const change of ['session','sequence']){
  const s=session(),d=deferred();const c=client(['ensureCurrentQuestion','ensureCurrentQuestionOwned'],{state:{activeSession:s},sessionContainerId:()=>'',renderSessionLoading(){},makeDailyPlan:()=>plan,consumeSessionPrefetch:async()=>null,generateOneQuestion:()=>d.promise,saveState(){},renderActiveSession(){throw Error('stale rendered')}});
  const p=c.ensureCurrentQuestion(s);await new Promise(r=>setImmediate(r));if(change==='session')c.state.activeSession=session();else s.results.push({});d.resolve({id:'old'});await p;assert.equal(s.currentQuestion,null);
 }
});
test('compatible topic-only and small difficulty replan reuses successful/inflight prefetch',async()=>{
 const s=session();s.results.push({});s.currentQuestion={id:'current'};let generated=0;
 const c=client(['plansCompatible','prefetchSupersedes','discardPrefetch','scheduleSessionPrefetch'],{previewPlanForSession:()=>({...plan,topic:'对数求导',targetDifficulty:6.5}),generateOneQuestion:async()=>{generated++;return {source:'ai'}}});
 const entry={request_id:'existing',issued:0,plan,question_sequence:1,startedAt:Date.now()};c.sessionPrefetch.set(s.id,entry);c.scheduleSessionPrefetch(s);assert.equal(generated,0);assert.equal(c.sessionPrefetch.get(s.id),entry);
 assert.equal(c.plansCompatible(plan,{...plan,module:'limit'}),false);assert.equal(c.plansCompatible({...plan,purpose:'review',reviewId:'a'},{...plan,purpose:'review',reviewId:'b'}),false);
});
test('failed background prefetch is evicted immediately and old fallback warmup is never consumed',async()=>{
 const s=session();s.results.push({});s.currentQuestion={id:'current'};
 const c=client(['plansCompatible','prefetchSupersedes','discardPrefetch','scheduleSessionPrefetch','consumeWarmup'],{previewPlanForSession:()=>plan,generationFingerprint:()=> 'fp',generateOneQuestion:async(p,meta)=>{assert.equal(meta.background,true);throw Error('transient')}});
 c.scheduleSessionPrefetch(s);await new Promise(r=>setImmediate(r));assert.equal(c.sessionPrefetch.has(s.id),false);
 c.warmupPrefetch.daily={fingerprint:'fp',startedAt:Date.now()-7200000,promise:Promise.resolve({question:{source:'fallback'},plan})};
 assert.equal(await c.consumeWarmup('daily',session()),null);
});
test('client cancellation interrupts shared deadline without a quality misclassification',async()=>{
 const c=backend(),controller=new AbortController();
 const work=c.withinBudget({},()=>new Promise(()=>{}),controller.signal);controller.abort();
 await assert.rejects(work,e=>e.code==='REQUEST_CANCELLED');
});
test('HTTP424 recoverable model failure and retry-after are honored, quality false is not',async()=>{
 const c=client(apiNames);assert.equal(c.apiRetryable('generate',{httpStatus:424,code:'UPSTREAM_RATE_LIMITED',retryable:true}),true);
 assert.equal(c.apiRetryable('generate',{httpStatus:424,code:'UPSTREAM_TIMEOUT',retryable:false}),false);
 let slept=0,calls=0;c.sleep=async n=>{slept=n};c.fetch=async()=>++calls===1?{ok:false,status:424,json:async()=>({code:'UPSTREAM_RATE_LIMITED',retryable:true,retry_after_ms:1500})}:{ok:true,status:200,json:async()=>({questions:[]})};
 await c.apiCall('judge');assert.equal(slept,1500);assert.equal(calls,2);
});

test('frontend empty payload and stale verification are protocol failures, never network',()=>{
 const c=client(['apiFailureKind']);
 assert.equal(c.apiFailureKind('generate',{code:'GENERATE_EMPTY'}),'generate_empty');
 assert.equal(c.apiFailureKind('generate',{code:'VERIFICATION_STALE'}),'generate_protocol_error');
});
