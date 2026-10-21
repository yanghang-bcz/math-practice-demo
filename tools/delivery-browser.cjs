'use strict';
// Real Chrome on local files; every remote request is intercepted. No production calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'..'), Q=require('../math-quality');
fs.mkdirSync(path.join(root,'verification'),{recursive:true});
const evidence=require('../tests/fixtures/delivery/live-api-evidence.json');
let mode='success',delay=0,calls=[];
const results=[],errors=[];
const hook=`window.__deliveryTest={get state(){return state},ensureCurrentQuestion,generateOneQuestion,scheduleSessionPrefetch,consumeSessionPrefetch,prefetchWarmup,consumeWarmup,plansCompatible,startDaily,startDiagnosis,switchView,skipDiagnosis,renderActiveSession,sessionPrefetch,warmupPrefetch,makeDailyPlan,createDailySession,previewPlanForSession,get records(){return diagRecords}};`;
const server=http.createServer((req,res)=>{
 const file=path.join(root,req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
 try{let content=fs.readFileSync(file);if(file.endsWith('app.js')){let text=content.toString();const pos=text.lastIndexOf('})();');content=text.slice(0,pos)+hook+text.slice(pos)}
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(content)}catch{res.writeHead(404).end()}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
 const context=await browser.newContext({viewport:{width:1365,height:1000}});
 await context.route('**/*',async route=>{
  const url=route.request().url();if(url.startsWith(origin))return route.continue();
  if(url.includes('/api/deepseek')){
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type'}});
   if(url.includes('health=1'))return route.fulfill({json:evidence.health,headers:{'access-control-allow-origin':'*'}});
   const body=route.request().postDataJSON();calls.push(body);const selected=mode;const wait=delay;
   if(wait)await new Promise(r=>setTimeout(r,wait));
   if(selected==='network')return route.abort('connectionrefused');
   if(selected==='reject'||selected==='legacy-reject')return route.fulfill({status:selected==='legacy-reject'?500:422,headers:{'access-control-allow-origin':'*'},json:{ok:false,error:'strict gate rejected',code:'GENERATION_REJECTED',stage:'quality',retryable:false,report_service_error:false,request_id:body.request_id,versions:evidence.health.pipeline}});
   if(body.action==='evaluate')return route.fulfill({json:{...evidence.requests[0].response,request_id:body.request_id},headers:{'access-control-allow-origin':'*'}});
   const selectedSample=evidence.requests.find(x=>x.response.questions?.[0].module===body.plans?.[0]?.module)||evidence.requests[0];
   const data=structuredClone(selectedSample.response);data.request_id=body.request_id;data.session_id=body.session_id;data.question_sequence=body.question_sequence;
   return route.fulfill({json:data,headers:{'access-control-allow-origin':'*'}});
  }
  if(url.endsWith('cloudbase.full.js'))return route.fulfill({body:'',contentType:'application/javascript'});
  return route.abort();
 });
 const page=await context.newPage();await page.addInitScript(()=>localStorage.clear());page.on('pageerror',e=>errors.push(e.message));
 async function reset(selected){mode=selected;delay=0;calls=[];await page.goto(origin);await page.waitForFunction(()=>window.__deliveryTest);await page.evaluate(()=>{const t=window.__deliveryTest;t.state.activeSession=null;t.sessionPrefetch.clear();t.warmupPrefetch.daily=null;t.warmupPrefetch.diagnosis=null;t.state.settings.difficultyMode='fixed';t.state.settings.manualLevels={limit:4,derivative:4,integral:4};t.switchView('daily');t.skipDiagnosis()});}
 async function run(name,work){const start=Date.now();await work();results.push({name,pass:true,duration_ms:Date.now()-start});}
 await run('quality rejection shows fallback without connection failure and counted once',async()=>{
  await reset('reject');await page.locator('#startDailyBtn').click();await page.waitForSelector('#answerInput');
  const data=await page.evaluate(()=>{const t=window.__deliveryTest;return {source:t.state.activeSession.currentQuestion.source,summary:CalcDailyDiag.summary(),display:t.records.filter(e=>e.event==='question_displayed'),badge:document.querySelector('#apiStatusText').textContent}});
  assert.equal(data.source,'fallback');assert.equal(data.summary.fallbackCount,1);assert.equal(data.display.length,1);assert.ok(!data.badge.includes('strict gate rejected'));
  await page.screenshot({path:path.join(root,'verification/final-browser-quality.png'),fullPage:true});
 });
 await run('real browser aborted requests classified as network',async()=>{
  await reset('network');await page.locator('#startDailyBtn').click();await page.waitForSelector('#answerInput');
  assert.ok(await page.evaluate(()=>window.__deliveryTest.records.some(e=>e.kind==='generate_network')));
 });
 await run('simultaneous ensures use one foreground call; successful AI remains stable',async()=>{
  await reset('success');delay=200;
  const data=await page.evaluate(async()=>{const t=window.__deliveryTest;const s=t.createDailySession();t.state.activeSession=s;await Promise.all([t.ensureCurrentQuestion(s),t.ensureCurrentQuestion(s)]);return {id:s.currentQuestion.id,source:s.currentQuestion.source,events:t.records.filter(e=>e.event==='question_displayed')}});
  assert.equal(data.source,'ai');assert.equal(data.events.length,1);
  const foreground=calls.filter(x=>x.request_id?.startsWith('slot'));assert.equal(foreground.length,1);
 });
 await run('compatible completed prefetch survives topic replan',async()=>{
  await reset('success');
  const data=await page.evaluate(async()=>{const t=window.__deliveryTest,s=t.createDailySession();t.state.activeSession=s;s.results.push({module:'limit',correct:true});s.currentQuestion={id:'placeholder',module:'limit'};t.scheduleSessionPrefetch(s);const entry=t.sessionPrefetch.get(s.id);await entry.promise;const expected={...entry.plan,topic:'replanned topic'};const q=await t.consumeSessionPrefetch(s,expected);return {source:q?.source,request:entry.request_id}});
  assert.equal(data.source,'ai');
 });
 await run('failed warmup evicted and next foreground recovers',async()=>{
  await reset('reject');
  await page.evaluate(async()=>{const t=window.__deliveryTest;t.state.activeSession=null;t.prefetchWarmup('daily');await t.warmupPrefetch.daily?.promise});
  assert.equal(await page.evaluate(()=>window.__deliveryTest.warmupPrefetch.daily),null);
  mode='success';await page.locator('#startDailyBtn').click();await page.waitForSelector('#answerInput');assert.equal(await page.evaluate(()=>window.__deliveryTest.state.activeSession.currentQuestion.source),'ai');
 });
 await run('three consecutive answered fallback questions rotate bank IDs',async()=>{
  await reset('reject');await page.locator('#startDailyBtn').click();const ids=[];
  for(let n=0;n<3;n++){
   await page.waitForSelector('#answerInput');const q=await page.evaluate(()=>window.__deliveryTest.state.activeSession.currentQuestion);ids.push(q.bankId);
   await page.locator('#answerInput').fill(q.answer);await page.locator('#submitAnswerBtn').click();await page.waitForSelector('#nextQuestionBtn');
   if(n<2)await page.locator('#nextQuestionBtn').click();
  }
  assert.equal(new Set(ids).size,3);
 });
 await run('committed fallback cannot be overwritten by an earlier delayed AI response',async()=>{
  await reset('success');delay=250;
  await page.evaluate(()=>{const t=window.__deliveryTest,s=t.createDailySession();t.state.activeSession=s;window.__pendingDelivery=t.ensureCurrentQuestion(s)});
  await page.waitForTimeout(40);mode='reject';delay=0;
  const id=await page.evaluate(async()=>{const t=window.__deliveryTest,s=t.state.activeSession;const q=await t.generateOneQuestion(t.makeDailyPlan(s));s.currentQuestion=q;t.renderActiveSession('dailySession');await window.__pendingDelivery;return {final:s.currentQuestion.id,committed:q.id,source:s.currentQuestion.source}});
  assert.equal(id.final,id.committed);assert.equal(id.source,'fallback');
 });
 await run('leaving a session prevents late AI from writing into the replacement',async()=>{
  await reset('success');delay=200;
  const data=await page.evaluate(async()=>{const t=window.__deliveryTest,s=t.createDailySession();t.state.activeSession=s;const pending=t.ensureCurrentQuestion(s);await new Promise(r=>setTimeout(r,20));const replacement=t.createDailySession();t.state.activeSession=replacement;await pending;return {old:s.currentQuestion,new:replacement.currentQuestion}});
  assert.equal(data.old,null);assert.equal(data.new,null);
 });
 await run('all twelve archived successful production responses still pass the strict local gate',async()=>{
  const responses=evidence.requests.filter(x=>x.response.questions).map(x=>x.response);
  const verdicts=await page.evaluate(rs=>rs.map(r=>MathQuality.gateApproved(r.questions[0])),responses);
  assert.equal(verdicts.length,12);assert.ok(verdicts.every(Boolean));
 });
 await run('new frontend accepts old backend quality500 without retry or connection warning',async()=>{
  await reset('legacy-reject');await page.locator('#startDailyBtn').click();await page.waitForSelector('#answerInput');
  const data=await page.evaluate(()=>{const t=window.__deliveryTest;return {source:t.state.activeSession.currentQuestion.source,badge:document.querySelector('#apiStatusText').textContent}});
  assert.equal(data.source,'fallback');assert.ok(!data.badge.includes('strict gate rejected'));
  const counts=new Map();for(const call of calls.filter(c=>c.action==='generate'))counts.set(call.request_id,(counts.get(call.request_id)||0)+1);
  assert.ok([...counts.values()].every(n=>n===1));
 });
 await run('collector records DOM delivery and first wait locally without credentials',async()=>{
  await reset('reject');await page.addScriptTag({content:fs.readFileSync(path.join(root,'tools/live-session-collector.js'),'utf8')});
  await page.locator('#startDailyBtn').click();await page.waitForSelector('#answerInput');
  let data;
  for(let attempt=0;attempt<24;attempt++){
    data=await page.evaluate(()=>CalcDailyAcceptance.export({source:'injected'}));
    if(data.visible.length)break;
    await page.waitForTimeout(250);
  }
  if(!data.visible.length)console.log(await page.evaluate(()=>({inputs:document.querySelectorAll('.question-card #answerInput').length,rects:document.querySelector('#answerInput')?.getClientRects().length,records:CalcDailyDiag.dump().filter(r=>r.event==='question_displayed'),status:document.readyState})));
  assert.equal(data.source,'injected');assert.equal(data.visible.length,1);assert.equal(data.visible[0].source,'fallback');
  assert.ok(data.visible[0].first_wait_ms>=0);assert.ok(data.requests.some(r=>r.action==='generate'&&r.stage==='quality'));
  assert.ok(!JSON.stringify(data).includes('Authorization'));assert.ok(data.requests.every(r=>!('headers' in r)&&!('body' in r)));
  await page.evaluate(()=>CalcDailyAcceptance.stop());
 });
 assert.deepEqual(errors,[]);
 await context.close();
 }finally{await browser.close();server.close();fs.writeFileSync(path.join(root,'verification/final-browser-results.json'),JSON.stringify({scope:'Local real Chrome; controlled API replay and fault injection, no live production requests',results,uncaught_errors:errors},null,2));}
 console.log(JSON.stringify(results,null,2));
})().catch(e=>{server.close();console.error(e);process.exitCode=1});
