const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const path=require('node:path');
const Q=require('../math-quality');
const draft=()=>({module:'limit',topic:'重要极限',instruction:'计算极限',expression:'\\lim_{x\\to0}\\sin(x)/x',answer:'1',solution:'利用重要极限，结果为 1。'});
const review=()=>({...Object.fromEntries(Q.fields.map(k=>[k,true])),confidence:.97,issues:[],independent_answer:'1'});
function approved(q=draft()) {q.verification={...review(),version:Q.VERSION,status:'approved',content:Q.content(q)};q.source='ai';return q;}
function backend(file) {
 const context=vm.createContext({require:createRequire(path.resolve(file)),module:{exports:{}},process,console,AbortSignal,fetch:async()=>{throw Error('Unexpected real network');},URL});
 let source=fs.readFileSync(file,'utf8');
 if(file.includes('cloudbase'))source=source.replace("server.listen(PORT, '0.0.0.0', () => {","if (false) server.listen(PORT, '0.0.0.0', () => {");
 vm.runInContext(source,context);return context;
}
for(const [a,b,want] of [['1/2','0','not_equivalent'],['1/2','0.5','equivalent'],['\\frac{1}{2}','50%','equivalent'],['-1/2','-.5','equivalent'],['不存在','DNE','equivalent'],['+∞','-∞','not_equivalent'],['不存在','∞','not_equivalent'],['无穷','+∞','uncertain'],['0','1e-15','not_equivalent'],['1/0','1/0','uncertain'],['x+C','x','uncertain'],['','0','uncertain']])test(`${a} vs ${b}`,()=>assert.equal(Q.compare(a,b),want));
test('reject explicit solution contradiction and broken question',()=>{
 assert.ok(Q.issues({...draft(),answer:'0',solution:'最终答案为 \\(1/2\\)。'}).includes('ANSWER_SOLUTION_MISMATCH'));
 assert.ok(Q.issues({...draft(),solution:'需要重新设计题目'}).length);
});
test('reject missing, stale and malformed verification',()=>{
 assert.equal(Q.approved(draft()),false);
 const q=approved();assert.equal(Q.approved(q),true);q.answer='0';assert.equal(Q.approved(q),false);
 const r=approved();r.verification.confidence='0.99';assert.equal(Q.approved(r),false);
});
for(const file of ['api/deepseek.js','cloudbase/deepseek/index.js']) {
 test(`${file}: rejected draft never returned; two attempts then failure`,async()=>{
  const c=backend(file);let calls=0;c.generateDraftQuestions=async()=>{calls++;return {questions:[draft()]}};
  c.callDeepSeek=async()=>({...review(),answer_correct:false});
  await assert.rejects(c.generateQuestions('mock',{plans:[{}]}));assert.equal(calls,2);
 });
 test(`${file}: failed review then independent pass`,async()=>{
  const c=backend(file);let calls=0;c.generateDraftQuestions=async()=>({questions:[draft()]});
  c.callDeepSeek=async()=>++calls===1?{...review(),solution_correct:false}:review();
  const r=await c.generateQuestions('mock',{plans:[{}]});assert.equal(calls,2);assert.ok(Q.approved(r.questions[0]));assert.ok(r.questions[0].question_id);
 });
 test(`${file}: 1/2 versus 0 cannot reach AI; uncertain AI stays untrusted`,async()=>{
  const c=backend(file);let calls=0;c.callDeepSeek=async()=>{calls++;return {verdict:'equivalent',question_valid:true,confidence:.99}};
  const q=approved({...draft(),answer:'0',solution:'结果为 0。'});
  assert.equal((await c.judgeAnswer('mock',{question:q,userAnswer:'1/2'})).verdict,'not_equivalent');assert.equal(calls,0);
  c.callDeepSeek=async()=>({verdict:'uncertain',question_valid:true,confidence:.99});
  assert.equal((await c.judgeAnswer('mock',{question:approved(),userAnswer:'sin(x)'})).trusted,false);
 });
 test(`${file}: mathematical disagreement defeats reviewer confidence`,async()=>{
  const c=backend(file);c.callDeepSeek=async()=>({...review(),independent_answer:'1/2'});
  assert.equal((await c.reviewQuestion('mock',{question:draft()})).status,'rejected');
 });
}
function appHarness() {
 let s=fs.readFileSync('app.js','utf8');
 // Extract real production functions without bootstrapping the UI.
 function fn(name) {const start=s.search(new RegExp('  (?:async )?function '+name+'\\('));const next=s.indexOf('\n  function ',start+1),nextAsync=s.indexOf('\n  async function ',start+1);const ends=[next,nextAsync].filter(x=>x>=0);return s.slice(start,Math.min(...ends));}
 const elements={answerInput:{value:'1/2'},submitAnswerBtn:{},box:{innerHTML:''},retryQualityBtn:{addEventListener(){}}};
 const records=[];const c=vm.createContext({MathQuality:Q,FALLBACK_BANK:[],state:{activeSession:null},$:id=>elements[id],console,localStorage:{getItem:()=>null,setItem:(k,v)=>records.push(v)},window:{dispatchEvent(){}},CustomEvent:function(){},toast(){},markApiRequestFailure(){},markApiRequestSuccess(){},apiCall:async()=>{throw Error('network')},saveState(){},ensureCurrentQuestion(){},document:{}});
 for(const name of ['trustedQuestion','reportQuestionIssue','voidQuestion','judgeAnswer','submitCurrentAnswer','generateOneQuestion'])vm.runInContext(fn(name),c);
 return {c,elements,records};
}
test('uncertain submission writes no ability, mastery, history, review, or session result',async()=>{
 const {c,elements,records}=appHarness();const q=approved();const session={mode:'daily',currentQuestion:q,results:[]};c.state.activeSession=session;
 c.judgeAnswer=async()=>({trusted:false,correct:null});
 await c.submitCurrentAnswer('box');assert.equal(session.results.length,0);assert.equal(q.status,'void');assert.match(elements.box.innerHTML,/本题不会影响你的学习记录/);assert.equal(records.length,1);
});
test('legacy or unreviewed AI generation falls back before evaluate',async()=>{
 const {c}=appHarness();c.apiCall=async()=>({questions:[draft()]});c.state.difficultyModel={version:'v0'};c.recentQuestionPrompts=()=>[];c.shortApiError=()=>'';c.fallbackQuestion=()=>({source:'fallback'});
 assert.equal((await c.generateOneQuestion({module:'limit'})).source,'fallback');
});
test('both deployment copies have identical deterministic rules',()=>assert.equal(fs.readFileSync('math-quality.js','utf8'),fs.readFileSync('cloudbase/deepseek/math-quality.js','utf8')));
test('large adjacent integers and tiny nonzero decimals remain distinct',()=>{
 assert.equal(Q.compare('9007199254740992','9007199254740993'),'not_equivalent');
 assert.equal(Q.compare('1e-400','0'),'not_equivalent');
 assert.equal(Q.compare('2/6','1/3'),'equivalent');
});
test('all shipped fallback questions pass content identity check',()=>{
 const s=fs.readFileSync('app.js','utf8');const start=s.indexOf('  const FALLBACK_BANK =');const end=s.indexOf('  function fallbackQuestion',start);
 const c=vm.createContext({});vm.runInContext(s.slice(start,end)+';globalThis.bank=FALLBACK_BANK;',c);
 assert.ok(c.bank.length>0);
 for(const b of c.bank)assert.equal(Q.content(b),Q.content({...b,id:'fallback-test',source:'fallback'}));
});
test('render gate blocks old cached/prefetched questions before question markup',()=>{
 const {c,elements}=appHarness();
 const source=fs.readFileSync('app.js','utf8');const start=source.indexOf('  function renderActiveSession('),end=source.indexOf('  async function submitCurrentAnswer',start);
 vm.runInContext(source.slice(start,end),c);
 elements.box.classList={remove(){}};
 const session={mode:'daily',currentQuestion:draft(),results:[]};c.state.activeSession=session;
 c.renderActiveSession('box');assert.equal(session.currentQuestion.status,'void');assert.match(elements.box.innerHTML,/已自动作废/);assert.ok(!elements.box.innerHTML.includes('\\lim'));
});
