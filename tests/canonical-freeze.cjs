'use strict';

/* =========================================================
   Task 5D：Canonical Package 不可变冻结
   =========================================================

   content() 已经把七个 canonical 字段压成一个字符串，闸门拿它比对。
   但那只是**一个字符串**：谁都能照着改完的题重算一次 content() 盖上去。

   这一组测的是「题目身份」这件事有独立的、可核对的指纹，而且：
     · 指纹只随身份变化 —— 难度重标定、展示层修正都不该让题目失效
     · 题目一旦被就地改写，判题立刻停手（不拿改过的答案去判学生的卷）
     · 备用题也不能例外 —— 它靠 bankId 命中，是最容易被绕过的一条路
   ========================================================= */

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const Q=require('../math-quality');
const Bank=require('../fallback-bank');
const support=require('../tools/test-support.cjs');

const read=support.read;

const draft=()=>({
  question_id:'q-limit-0001',
  module:'limit',
  topic:'重要极限',
  instruction:'计算下列极限',
  expression:'\\lim_{x\\to0}\\frac{\\sin x}{x}',
  prompt:'',
  answer:'1',
  solution:'利用重要极限 \\\\(\\\\sin x\\\\sim x\\\\)，结果为 \\\\(1\\\\)。',
  source:'ai',
  created_at:'2026-09-19T10:00:00.000Z'
});

function frozen(overrides={}) {
  const q={...draft(),...overrides};
  q.verification={
    ...Object.fromEntries(Q.fields.map(k=>[k,true])),
    confidence:.97,
    issues:[],
    independent_answer:'1',
    version:Q.VERSION,
    status:'approved',
    pipeline:{protocol:2,generator:'generator-v2',reviewer:'reviewer-v2',judge:'judge-v2',math_engine:Q.VERSION}
  };
  q.verification.content=Q.content(q);
  return Q.freezeCanonical(q);
}

/* =========================================================
   1. 包的结构
   ========================================================= */

test('Canonical Package 必须把身份、答案、验证与版本一次列全',()=>{
  const q=frozen();
  const pkg=Q.canonicalPackage(q);

  for (const key of ['question_id','question','canonical_answer','solution','module','topic','difficulty','verification','source','versions','created_at']) {
    assert.ok(key in pkg, `Canonical Package 少了字段 ${key}`);
  }

  assert.equal(pkg.question_id,'q-limit-0001');
  assert.equal(pkg.canonical_answer,'1');
  assert.equal(pkg.module,'limit');
  assert.equal(pkg.topic,'重要极限');
  assert.equal(pkg.question.expression,q.expression);
  assert.equal(pkg.question.instruction,q.instruction);
  assert.equal(pkg.source,'ai');
  assert.equal(pkg.created_at,'2026-09-19T10:00:00.000Z');

  // 版本必须原样带出来，不然「线上跑的是哪一版」又变成一个靠猜的问题
  assert.equal(pkg.versions.protocol,2);
  assert.equal(pkg.versions.generator,'generator-v2');
  assert.equal(pkg.versions.reviewer,'reviewer-v2');
  assert.equal(pkg.versions.judge,'judge-v2');
  assert.equal(pkg.versions.math_engine,Q.VERSION);

  // verification 只保留与身份有关的几项，不要把审核员的全套布尔搬进来
  assert.deepEqual(Object.keys(pkg.verification).sort(),['confidence','content','status','version']);
});

/* =========================================================
   2. 指纹只随身份变化
   ========================================================= */

test('★ 难度重标定与展示层修正不得改变题目身份',()=>{
  const q=frozen();
  const before=Q.canonicalDigest(q);

  // 难度是标定量：随作答数据重算，改了它不算换了题目
  for (const patch of [
    {calibratedDifficulty:11.4},
    {provisionalDifficulty:3},
    {difficulty:9},
    {requestedDifficulty:7},
    {difficultyConfidence:.12},
    {difficultyModelVersion:'v0-provisional'},
    {difficultyDimensions:{recognition:9,techniqueDepth:9,calculationComplexity:9,knowledgeCoupling:9}}
  ]) {
    assert.equal(Q.canonicalDigest({...q,...patch}),before,
      `改了 ${Object.keys(patch)[0]} 却把题目身份也改了 —— 重新标定会无谓地切碎历史记录`);
  }

  // 展示层修正：审核员认为考点/难度不贴切时的修正，只影响展示
  assert.equal(Q.canonicalDigest({...q,displayTopic:'洛必达法则'}),before);
  assert.equal(Q.canonicalDigest({...q,displayDifficulty:9}),before);
  assert.equal(Q.canonicalDigest({...q,metadataCorrection:{topic:'洛必达法则'}}),before);
  assert.equal(Q.canonicalDigest({...q,status:'void'}),before);
  assert.equal(Q.canonicalDigest({...q,canonical_digest:'deadbeef'}),before);
  assert.equal(Q.canonicalDigest({...q,canonical_frozen_at:'2020-01-01T00:00:00.000Z'}),before);
});

test('★ 七个 canonical 字段、question_id、source 任一变化都必须换指纹',()=>{
  const q=frozen();
  const before=Q.canonicalDigest(q);

  for (const field of Q.CANONICAL_FIELDS) {
    const next={...q};
    next[field]=field==='answer'?String(q.answer)+'0':String(q[field]||'')+'!';
    assert.notEqual(Q.canonicalDigest(next),before,`${field} 不在指纹里 —— 改了它题目还叫同一个身份`);
    assert.deepEqual(Q.canonicalChangedFields(q,next),[field]);
  }

  assert.notEqual(Q.canonicalDigest({...q,question_id:'q-limit-0002'}),before,'换了 question_id 指纹必须跟着换');
  assert.notEqual(Q.canonicalDigest({...q,source:'fallback'}),before,'改了来源却在指纹里看不出来');

  // answer 的清空也算改动（空答案不是「没答案」，是另一种题）
  assert.notEqual(Q.canonicalDigest({...q,answer:''}),before);
});

test('指纹是内容决定的，不是时间决定的',()=>{
  const a=frozen();
  const b={...a,canonical_frozen_at:undefined,canonical_digest:undefined};
  assert.equal(Q.canonicalDigest(a),Q.canonicalDigest(b),'同一份内容必须得到同一个指纹');
  assert.match(a.canonical_digest,/^[0-9a-f]{8}$/);
});

/* =========================================================
   3. 冻结不污染 content() 快照
   ========================================================= */

test('canonical_digest 不得进入 content() 快照',()=>{
  const q={...draft(),prompt:'求该极限'};
  const before=Q.content(q);
  assert.equal(Q.content(Q.freezeCanonical({...q})),before,
    '冻结写回了 canonical 字段 —— 题目会被自己判成「异常」');
  assert.equal(Q.content({...q,canonical_frozen_at:'2026-09-19T10:00:00.000Z'}),before);
});

/* =========================================================
   4. 完整性核对
   ========================================================= */

test('★ 没记录过指纹的老数据一律按「未记录」处理，不得判成篡改',()=>{
  const legacy={...draft(),answer:'0'};
  const integrity=Q.canonicalIntegrity(legacy);

  // 历史记录、云端快照里大量题目是 Task 5D 之前存下的。
  // 把它们判成篡改，老用户一开 App 就会满屏「这道题存在异常」。
  assert.equal(integrity.ok,true);
  assert.equal(integrity.reason,'unfrozen');
  assert.equal(integrity.recorded,null);
  assert.equal(Q.canonicalIntact(legacy),true);
});

test('★ 冻结之后任何 canonical 改动都必须被抓住',()=>{
  const q=frozen();
  assert.equal(Q.canonicalIntact(q),true);
  assert.equal(Q.canonicalIntegrity(q).reason,'intact');

  const tampered={...q,answer:'-1'};
  const integrity=Q.canonicalIntegrity(tampered);

  assert.equal(integrity.ok,false);
  assert.equal(integrity.reason,'mutated');
  assert.equal(integrity.recorded,q.canonical_digest);
  assert.notEqual(integrity.actual,integrity.recorded);

  // 有人「顺手把快照也改了」—— 这正是 content() 单独守不住的那条路
  const coverUp={...tampered,verification:{...q.verification,content:Q.content(tampered)}};
  assert.equal(Q.canonicalIntact(coverUp),false,
    '把 verification.content 也改成新题面的样子就骗过去了 —— 指纹必须独立于快照');
});

/* =========================================================
   5. 闸门与被改题目的关系
   ========================================================= */

test('被就地改写的题目必须过不了闸门',()=>{
  const q=frozen();
  assert.equal(Q.gateApproved(q),true);

  const tampered={...q,answer:'-1'};
  const decision=Q.gateDecision(tampered);

  assert.equal(decision.ok,false);
  assert.equal(decision.state,Q.GATE.REJECTED);
  assert.equal(decision.code,Q.CODES.CANONICAL_MUTATED);
  assert.equal(Q.approved(tampered),false);
  assert.ok(Q.issues(tampered).includes(Q.CODES.CANONICAL_MUTATED));

  // 身份都不成立时不要再往下验答案：拿一道「不知道是谁」的题去验证，
  // 只会得到一条误导性的结论（这里是 -1 ≠ 1，但真实场景里不一定是这样）
  assert.deepEqual(Q.issues(tampered),[Q.CODES.CANONICAL_MUTATED]);
});

/* =========================================================
   6. 生产路径：app.js 端的闸门
   ========================================================= */

/* appHarness：从真实 app.js 里切出生产函数，不引导整个 UI。
   和 pipeline-v3.cjs 的做法一致 —— 测的是生产代码本身。 */
function appHarness(){
  const source=read('app.js');
  const fn=support.appSlice(source);

  let apiCalls=0;
  const issues=[];

  const context=vm.createContext({
    MathQuality:Q,
    FallbackBank:Bank,
    FALLBACK_BANK:Bank.BANK,
    ...support.diagContextBits(source),
    state:{difficultyModel:{version:'v0-provisional'},history:[]},
    console:{log(){},warn(){},error(){}},
    window:{dispatchEvent(){}},
    CustomEvent:function(){},
    localStorage:{getItem:()=>null,setItem:()=>{}},
    Date,
    Math,
    JSON,
    uid:prefix=>`${prefix}-test`,
    clamp:(v,lo,hi)=>Math.min(hi,Math.max(lo,v)),
    calibrateDifficulty:v=>v,
    reportQuestionIssue(...args){issues.push(args);},
    apiCall:async()=>{apiCalls++;throw new Error('这是网络桩，不该被调到');}
  });

  for(const name of [...support.DIAG_FUNCTIONS,'freezeQuestion','canonicalIntegrityOf','closestFallback','recentFallbackIds','fallbackQuestion','trustedQuestion','voidQuestion','judgeUnavailable','judgeAnswer']){
    vm.runInContext(fn(name),context);
  }

  return {c:context,issues,apiCalls:()=>apiCalls};
}

test('★ 备用题也必须带身份指纹 —— bankId 命中不等于内容没被改过',async()=>{
  const h=appHarness();
  const q=h.c.fallbackQuestion({module:'limit',targetDifficulty:3,purpose:'daily'});

  assert.ok(q&&q.answer,'备用题必须真的取到一道题');
  assert.equal(q.source,'fallback');
  assert.ok(q.bankId,'备用题要留下 bankId，否则复习时会因为缺 verification 被判成不可信');
  assert.ok(q.canonical_digest,'备用题没有冻结身份 —— trustedQuestion 会只凭 bankId 放行');
  assert.equal(h.c.canonicalIntegrityOf(q).ok,true);

  // 没被动过：正常判题
  const ok=await h.c.judgeAnswer(q,q.answer);
  assert.equal(ok.trusted,true,'答案与参考答案相同时必须判得出来');
  assert.equal(ok.correct,true);

  // 被就地改写：必须停手，而且不能去问服务端
  const before=h.apiCalls();
  const tampered=h.c.fallbackQuestion({module:'limit',targetDifficulty:3,purpose:'daily'});
  tampered.answer=`${tampered.answer}+7`;

  const result=await h.c.judgeAnswer(tampered,tampered.answer);

  assert.equal(result.correct,null,'题目身份已失效却给了对错结论');
  assert.equal(result.trusted,false);
  assert.equal(result.reason,Q.JUDGE_REASONS.QUESTION_UNTRUSTED);
  assert.equal(h.apiCalls(),before,'身份已失效的题还去问服务端，等于把「拿改过的答案判卷」外包给模型');
  assert.ok(h.issues.length,'被篡改的题目必须留一条上报记录');
});

test('★ AI 题被改写同样停手（content() 快照失配与指纹各守一边）',async()=>{
  const h=appHarness();
  const q=frozen();
  const tampered={...q,expression:'\\lim_{x\\to0}\\frac{\\sin 2x}{x}'};

  const result=await h.c.judgeAnswer(tampered,'1');

  assert.equal(result.trusted,false);
  assert.equal(result.reason,Q.JUDGE_REASONS.QUESTION_UNTRUSTED);
  assert.equal(h.apiCalls(),0);
});

test('没有被改写的 AI 题照常判题（闸门不能误伤）',async()=>{
  const h=appHarness();
  const q=frozen();
  const right=await h.c.judgeAnswer(q,'1');
  const wrong=await h.c.judgeAnswer(q,'2');

  assert.equal(right.trusted,true);
  assert.equal(right.correct,true);
  assert.equal(wrong.trusted,true);
  assert.equal(wrong.correct,false);
  assert.equal(h.apiCalls(),0,'确定性引擎能定的结论不该消耗一次模型调用');
});
