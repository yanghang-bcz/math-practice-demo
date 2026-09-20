const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const path=require('node:path');
const Q=require('../math-quality');
const support=require('../tools/test-support.cjs');
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
 const issues=Q.issues({...draft(),answer:'0',solution:'最终答案为 \\(1/2\\)。'});
 // v2 起 SOLUTION_MISMATCH 才是规范名（v1 叫 ANSWER_SOLUTION_MISMATCH）。
 assert.ok(issues.includes('SOLUTION_MISMATCH'),'解析与答案矛盾必须被指出：'+JSON.stringify(issues));
 // 而且这道题的答案本身也过不了确定性验证。
 assert.ok(issues.includes('ANSWER_FAILS_VERIFICATION'),'sin(x)/x 的答案是 0 必须被验证引擎抓住：'+JSON.stringify(issues));
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
 test(`${file}: 判题先用确定性引擎，够不着才问 AI`,async()=>{
  const c=backend(file);let calls=0;c.callDeepSeek=async()=>{calls++;return {verdict:'equivalent',question_valid:true,confidence:.99}};
  // 注意：这里必须用一道**本身有效**的题。v1 的夹具给 sin(x)/x 配了答案 0，
  // 新引擎会先把这道错题本身拦下来（ANSWER_FAILS_VERIFICATION），于是根本轮不到判题，
  // 测的就不再是「判题要不要调 AI」了。
  const q=approved();
  assert.equal((await c.judgeAnswer('mock',{question:q,userAnswer:'1/2'})).verdict,'not_equivalent');
  assert.equal(calls,0,'确定性引擎能定的结论不该消耗一次 AI 调用');
  c.callDeepSeek=async()=>({verdict:'uncertain',question_valid:true,confidence:.99});
  // 必须用一个机器真的判不了的答案。'sin(x)' 在 Task #4 之后会被结构检查算出来
  // （lim sin(x)/x = 1 ≠ 0），直接由引擎判掉、不再落到模型，测的就不是这条了。
  assert.equal((await c.judgeAnswer('mock',{question:approved(),userAnswer:'\\Gamma(x)'})).trusted,false);
 });
 test(`${file}: 参考答案本身不满足题目时，判题必须拒绝作答`,async()=>{
  const c=backend(file);let calls=0;c.callDeepSeek=async()=>{calls++;return {verdict:'equivalent',question_valid:true,confidence:.99}};
  // 这是 v1 线上那类错题：sin(x)/x 的极限写成 0。
  const broken=approved({...draft(),answer:'0',solution:'结果为 0。'});
  const r=await c.judgeAnswer('mock',{question:broken,userAnswer:'1/2'});
  assert.equal(r.trusted,false,'参考答案错误的题目不得给出可信结论');
  assert.equal(calls,0,'题目本身已失效，不该再去问 AI');
 });
 test(`${file}: mathematical disagreement defeats reviewer confidence`,async()=>{
  const c=backend(file);c.callDeepSeek=async()=>({...review(),independent_answer:'1/2'});
  assert.equal((await c.reviewQuestion('mock',{question:draft()})).status,'rejected');
 });
}
function appHarness() {
 const s=fs.readFileSync('app.js','utf8');
 // Extract real production functions without bootstrapping the UI.
 const fn=support.appSlice(s);
 const elements={answerInput:{value:'1/2'},submitAnswerBtn:{},box:{innerHTML:''},retryQualityBtn:{addEventListener(){}}};
 const records=[];
 // 注意 FallbackBank：切片按「下一个顶层声明」断开，`const FALLBACK_BANK = ...`
 // 适配层不会被带进来，但 judgeAnswer / trustedQuestion 都要用它。
 // 把模块本身喂进去（也更接近浏览器里的实际环境）。
 // apiProtocol 是 app.js 顶层的 let（Task 5I），切片函数会读它 —— 沙箱里补一个。
 const c=vm.createContext({MathQuality:Q,FallbackBank:require('../fallback-bank'),FALLBACK_BANK:require('../fallback-bank').BANK,...support.diagContextBits(s),state:{activeSession:null},$:id=>elements[id],console,localStorage:{getItem:()=>null,setItem:(k,v)=>records.push(v)},window:{dispatchEvent(){}},CustomEvent:function(){},toast(){},markApiRequestFailure(){},markApiRequestSuccess(){},apiCall:async()=>{throw Error('network')},saveState(){},ensureCurrentQuestion(){},document:{}});
 for(const name of [...support.DIAG_FUNCTIONS,'nextRequestId','apiFailureKind','clientPipeline','pipelineMismatch','checkResponseProtocol','knownProtocolMismatch','freezeQuestion','canonicalIntegrityOf','discardPrefetch','trustedQuestion','reportQuestionIssue','voidQuestion','judgeUnavailable','judgeAnswer','submitCurrentAnswer','generateOneQuestion'])vm.runInContext(fn(name),c);
 return {c,elements,records};
}
test('题目不可信时作废该题，且不写入任何学习记录',async()=>{
 const {c,elements,records}=appHarness();const q=approved();const session={mode:'daily',currentQuestion:q,results:[]};c.state.activeSession=session;
 c.judgeAnswer=async()=>({trusted:false,correct:null,reason:Q.JUDGE_REASONS.QUESTION_UNTRUSTED});
 await c.submitCurrentAnswer('box');assert.equal(session.results.length,0);assert.equal(q.status,'void');assert.match(elements.box.innerHTML,/本题不会影响你的学习记录/);assert.equal(records.length,1);
});
test('★ 判题服务连不上时不得作废题目，且必须保住用户的作答',async()=>{
 const {c,elements,records}=appHarness();const q=approved();const session={mode:'daily',currentQuestion:q,results:[]};c.state.activeSession=session;
 c.judgeAnswer=async()=>({trusted:false,correct:null,reason:Q.JUDGE_REASONS.JUDGE_UNAVAILABLE});
 await c.submitCurrentAnswer('box');
 assert.equal(session.results.length,0,'没有判定结论就不该写学习记录');
 assert.notEqual(q.status,'void','网络故障被当成了「题目有问题」');
 assert.ok(!/已自动作废/.test(elements.box.innerHTML),'界面不得把网络故障说成题目异常');
 assert.equal(elements.answerInput.value,'1/2','一次网络抖动不该把用户写的答案丢掉');
 assert.equal(elements.submitAnswerBtn.disabled,false,'按钮必须回到可重试状态');
 assert.equal(elements.submitAnswerBtn.textContent,'重试提交','按钮文案要说明可以重试');
 assert.equal(records.length,0,'网络故障不是题目质量事故，不该上报为题目问题');
});
test('★ 判题返回不可用时同样不得作废题目',async()=>{
 const {c,elements,records}=appHarness();const q=approved();const session={mode:'daily',currentQuestion:q,results:[]};c.state.activeSession=session;
 c.judgeAnswer=async()=>({trusted:false,correct:null,reason:Q.JUDGE_REASONS.JUDGE_UNCERTAIN});
 await c.submitCurrentAnswer('box');
 assert.notEqual(q.status,'void');assert.equal(records.length,0);assert.equal(elements.answerInput.value,'1/2');
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
 // v1 这里是从 app.js 里 slice 出内联题库；v2 起题库在独立模块里，
 // 而且 trustedQuestion 还要看 bankId，所以直接测真实链路更有意义。
 const bank=require('../fallback-bank').BANK;
 assert.ok(bank.length>0);
 for(const b of bank)assert.equal(Q.content(b),Q.content({...b,id:'fallback-test',source:'fallback'}));
});
test('★ 备用题被包装成题目对象后仍必须被 trustedQuestion 认可',()=>{
 const {c}=appHarness();
 for(const b of require('../fallback-bank').BANK){
  // fallbackQuestion 会往上叠这些字段。
  const wrapped={...b,id:'fallback-'+b.id,source:'fallback',bankId:b.id,requestedDifficulty:6,provisionalDifficulty:b.difficulty,difficultyConfidence:0.35,planPurpose:'daily',reviewId:null};
  assert.equal(c.trustedQuestion(wrapped),true,b.id+' 包装后不再被认可');
 }
 // 反向：不在题库里的东西不能凭一个 source 字段就自称可信。
 assert.equal(c.trustedQuestion({...bank0(),source:'fallback'}),false);
});
function bank0(){return {module:'limit',topic:'x',instruction:'计算极限',expression:'\\lim_{x\\to0}\\frac{\\sin x}{x}',answer:'999',solution:'编的。'};}
test('render gate blocks old cached/prefetched questions before question markup',()=>{
 const {c,elements}=appHarness();
 const source=fs.readFileSync('app.js','utf8');const start=source.indexOf('  function renderActiveSession('),end=source.indexOf('  async function submitCurrentAnswer',start);
 vm.runInContext(source.slice(start,end),c);
 elements.box.classList={remove(){}};
 const session={mode:'daily',currentQuestion:draft(),results:[]};c.state.activeSession=session;
 c.renderActiveSession('box');assert.equal(session.currentQuestion.status,'void');assert.match(elements.box.innerHTML,/已自动作废/);assert.ok(!elements.box.innerHTML.includes('\\lim'));
});
