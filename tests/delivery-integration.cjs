'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const Q=require('../math-quality'),support=require('../tools/test-support.cjs');
const source=support.read('app.js'),fn=support.appSlice(source);
const q={module:'derivative',topic:'基础求导',instruction:'求导',expression:'y=x^2',answer:'2x',solution:'幂函数求导。'};
const review=()=>({...Object.fromEntries(Q.fields.map(k=>[k,true])),confidence:.99,independent_answer:'2x'});
function backend(file='api/deepseek.js'){
 const c=vm.createContext({require:createRequire(path.resolve(file)),module:{exports:{}},process:{env:{DEEPSEEK_API_KEY:'test-only'}},console:{log(){},warn(){},error(){}},AbortController,AbortSignal,URL,setTimeout,clearTimeout});
 vm.runInContext(support.read(file).replace("server.listen(PORT, '0.0.0.0', () => {","if(false) server.listen(PORT, '0.0.0.0', () => {"),c);return c;
}
for(const file of ['api/deepseek.js','cloudbase/deepseek/index.js']){
 test(file+': concurrent and replayed generation IDs share one upstream operation',async()=>{
  const c=backend(file);let calls=0;c.generateDraftQuestions=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return {questions:[{...q}]}};c.callDeepSeek=async()=>review();
  const body={request_id:'dedup-test',plans:[{module:'derivative',targetDifficulty:6}]};
  const [a,b]=await Promise.all([c.generateQuestions('mock',body),c.generateQuestions('mock',{...body,attempt:2,budget_ms:1000})]);
  assert.equal(calls,1);assert.equal(a.questions[0].question_id,b.questions[0].question_id);
  const replay=await c.generateQuestions('mock',body);assert.equal(calls,1);assert.equal(replay.questions[0].question_id,a.questions[0].question_id);
 });
 test(file+': reused ID with different input is rejected before another model call',async()=>{
  const c=backend(file);let calls=0;c.generateDraftQuestions=async()=>{calls++;return {questions:[{...q}]}};c.callDeepSeek=async()=>review();
  await c.generateQuestions('mock',{request_id:'same',plans:[{module:'derivative'}]});
  await assert.rejects(c.generateQuestions('mock',{request_id:'same',plans:[{module:'limit'}]}),e=>e.code==='REQUEST_ID_CONFLICT'&&e.statusCode===409);assert.equal(calls,1);
 });
 test(file+': failed result is replayed without another paid operation',async()=>{
  const c=backend(file);let calls=0;c.generateDraftQuestions=async()=>{calls++;throw Object.assign(Error('unauthorized'),{code:'UPSTREAM_REJECTED',statusCode:401})};
  await assert.rejects(c.generateQuestions('mock',{request_id:'failed'}));await assert.rejects(c.generateQuestions('mock',{request_id:'failed'}));assert.equal(calls,1);
 });
 test(file+': ingress elapsed time consumes request budget',async()=>{
  const c=backend(file),start=performance.now();
  await assert.rejects(c.withinBudget({},()=>new Promise(()=>{}),undefined,Date.now()+25),e=>e.code==='UPSTREAM_TIMEOUT');assert.ok(performance.now()-start<300);
 });
 test(file+': health advertises additive contract without changing protocol or math policy',()=>{
  const h=backend(file).healthPayload(true);assert.equal(h.delivery_contract,'v1.2-safe-merge');assert.equal(h.gate_policy,'strict-tier-b');assert.equal(h.protocol_version,2);assert.equal(h.generation_http_retry_safe,false);
 });
}
test('generation cannot auto-resubmit even if a caller overrides attempts',async()=>{
 let calls=0;const c=vm.createContext({...support.diagContextBits(source),MathQuality:Q,console:{warn(){},log(){}},AbortController,setTimeout,clearTimeout,AI_API_URL:'https://test.invalid',sleep:async()=>{},RETRY_BASE_MS:600,RETRY_JITTER_MS:600,
 ...Object.fromEntries(['API_RETRY','API_TIMEOUTS','API_BUDGETS'].map(k=>[k,support.constObjectFrom(source,k)])),fetch:async()=>{calls++;throw new TypeError('response lost after model accepted')}});
 for(const name of [...support.DIAG_FUNCTIONS,'nextRequestId','retryDelay','apiTimeoutError','apiFailureKind','apiRetryable','apiCall'])vm.runInContext(fn(name),c);
 await assert.rejects(c.apiCall('generate',{}, {attempts:4}));assert.equal(calls,1);
});
test('old and new state readers preserve learning records and optional delivery metadata',()=>{
 const baseline=require('./fixtures/delivery/state-v2.json');
 const c=vm.createContext({DEFAULT_STATE:support.constObjectFrom(source,'DEFAULT_STATE'),deepClone:v=>JSON.parse(JSON.stringify(v))});
 vm.runInContext(fn('mergeState'),c);
 const input={...baseline,recentDisplayedFallbackIds:['fb-1'],activeSession:{id:'s',currentQuestion:{...q,deliveryOrigin:'prefetch'}}};
 const after=JSON.parse(JSON.stringify(c.mergeState(input)));
 for(const key of ['version','profile','settings','stats','history','reviews','checkins'])assert.deepEqual(after[key],input[key],key);
 assert.equal(after.version,2);assert.deepEqual(after.recentDisplayedFallbackIds,['fb-1']);
 const oldReader=vm.createContext({DEFAULT_STATE:require('./fixtures/delivery/legacy-client.json').constants.DEFAULT_STATE,deepClone:v=>JSON.parse(JSON.stringify(v))});
 vm.runInContext(require('./fixtures/delivery/legacy-client.json').functions.mergeState,oldReader);
 const oldRoundTrip=JSON.parse(JSON.stringify(oldReader.mergeState(after)));
 for(const key of ['version','profile','settings','stats','history','reviews','checkins'])assert.deepEqual(oldRoundTrip[key],input[key]);
 const absent=c.mergeState(baseline);assert.deepEqual(Array.from(absent.recentDisplayedFallbackIds),[]);
});

const legacy=require('./fixtures/delivery/legacy-client.json');
function httpClient(old,impl){
 const c=vm.createContext({...support.diagContextBits(source),MathQuality:Q,console:{warn(){},log(){}},AbortController,setTimeout,clearTimeout,AI_API_URL:'https://test.invalid',sleep:async()=>{},RETRY_BASE_MS:600,RETRY_JITTER_MS:600,
 ...Object.fromEntries(['API_RETRY','API_TIMEOUTS','API_BUDGETS'].map(k=>[k,old?legacy.constants[k]:support.constObjectFrom(source,k)])),fetch:impl});
 for(const n of support.DIAG_FUNCTIONS)vm.runInContext(fn(n),c);
 for(const n of ['nextRequestId','retryDelay','apiTimeoutError','apiFailureKind','apiRetryable','apiCall'])vm.runInContext(old?legacy.functions[n]:fn(n),c);
 return c;
}
for(const oldClient of [true,false])for(const oldServer of [true,false]){
 test(`${oldClient?'old':'new'} frontend + ${oldServer?'old':'new'} backend keeps success and typed rejection compatible`,async()=>{
  const server=backend(),body={action:'generate',request_id:'mixed'};
  const failure=oldServer?{status:500,data:{error:'quality gate',code:'GENERATION_REJECTED'}}:server.failureResponse(Object.assign(Error('quality gate'),{code:'GENERATION_REJECTED'}),body);
  let requests=0;const c=httpClient(oldClient,async()=>{requests++;return {ok:false,status:failure.status,json:async()=>failure.data}});
  await assert.rejects(c.apiCall('generate',{request_id:'mixed'}),e=>e.code==='GENERATION_REJECTED');
  assert.equal(requests,oldClient&&oldServer?2:1);
  const payload=server.withResponseMeta({questions:[{...q}],gate_policy:'strict-tier-b'},body);
  c.fetch=async()=>({ok:true,status:200,json:async()=>payload});
  assert.equal((await c.apiCall('generate',{request_id:'mixed'})).questions[0].answer,'2x');
 });
}
test('request identities are unique across page contexts in the same millisecond',()=>{
 const ids=new Set();
 for(let i=0;i<20;i++){
  const c=vm.createContext({...support.runtimeBitsFrom(source),Date:{now:()=>123456789},Math});vm.runInContext(fn('nextRequestId'),c);ids.add(c.nextRequestId('slot'));
 }
 assert.equal(ids.size,20);
});

test('CloudBase transport includes body read time in its single entry deadline',async()=>{
 const {EventEmitter}=require('node:events');let handler;
 const fakeHttp={createServer(cb){handler=cb;return {listen(){}}}};
 const realRequire=createRequire(path.resolve('cloudbase/deepseek/index.js'));
 const c=vm.createContext({require:name=>name==='http'?fakeHttp:realRequire(name),process:{env:{DEEPSEEK_API_KEY:'test-only'}},console:{log(){},warn(){},error(){}},AbortController,AbortSignal,URL,setTimeout,clearTimeout});
 vm.runInContext(support.read('cloudbase/deepseek/index.js').replace('const REQUEST_BUDGET_MS = 30000;', 'const REQUEST_BUDGET_MS = 200;'),c);
 c.generateDraftQuestions=async()=>new Promise(()=>{});
 const req=new EventEmitter();Object.assign(req,{method:'POST',url:'/',headers:{host:'localhost'}});
 const res=new EventEmitter();let status,body;res.writeHead=s=>status=s;res.end=v=>{body=JSON.parse(v);res.writableEnded=true};
 const start=performance.now(),pending=handler(req,res);
 setTimeout(()=>{req.emit('data',JSON.stringify({action:'generate',request_id:'ingress-budget'}));req.emit('end')},150);
 await pending;const elapsed=performance.now()-start;
 assert.ok(elapsed>=180&&elapsed<290,`entry-to-response=${elapsed}`);assert.equal(status,424);assert.equal(body.code,'UPSTREAM_TIMEOUT');
});
test('model status remains observable without converting a handled dependency failure to server500',()=>{
 const result=backend().failureResponse(Object.assign(Error('authorization rejected'),{code:'UPSTREAM_REJECTED',statusCode:401}),{action:'generate'});
 assert.equal(result.status,424);assert.equal(result.data.upstream_status,401);assert.equal(result.data.retryable,false);
});
