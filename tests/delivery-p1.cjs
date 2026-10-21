'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {createRequire}=require('node:module');const support=require('../tools/test-support.cjs');const Q=require('../math-quality');
function backend(){const c=vm.createContext({require:createRequire(path.resolve('api/deepseek.js')),module:{exports:{}},process,console:{log(){},warn(){},error(){}},AbortController,AbortSignal,setTimeout,clearTimeout});vm.runInContext(support.read('api/deepseek.js'),c);return c}
const question={module:'derivative',instruction:'求导',topic:'复合函数求导',expression:'y=x^2',answer:'2x',solution:'求导得到结果。'};
const review=q=>({...Object.fromEntries(Q.fields.map(k=>[k,true])),confidence:.99,independent_answer:q.answer});
test('P1: retry carries rejection evidence, same requested level/topic, and excluded expression',async()=>{
 const c=backend();const inputs=[];let draft=0;
 c.generateDraftQuestions=async(k,body)=>{inputs.push(body);return {questions:[++draft===1?{...question,answer:'3x'}:{...question,expression:'y=x^3',answer:'3x^2'}]}};
 c.callDeepSeek=async()=>review({...question,answer:'3x^2'});
 const result=await c.generateQuestions('test',{plans:[{module:'derivative',topic:'复合函数求导',targetDifficulty:12}]});
 assert.equal(result.attempts,2);assert.equal(inputs[1].regenerationFeedback.deterministic,'not_equivalent');assert.ok(inputs[1].avoidPrompts.includes('y=x^2'));
 assert.equal(inputs[1].plans[0].targetDifficulty,12);assert.equal(inputs[1].plans[0].topic,'复合函数求导');assert.equal(Q.gateApproved(result.questions[0]),true);
});
test('P1: unsupported preflight skips reviewer, preserves UNCERTAIN and distinguishes capability',async()=>{
 const c=backend();let reviewer=0;
 c.generateDraftQuestions=async()=>({questions:[{...question,expression:'y=\\Gamma(x)',answer:'unknown'}]});c.callDeepSeek=async()=>{reviewer++;throw Error('should not run')};
 await assert.rejects(c.generateQuestions('test',{}),e=>{assert.equal(e.code,'GENERATION_UNVERIFIED');assert.equal(e.gateState,'UNCERTAIN');assert.ok(e.rejectionReasons.includes('UNVERIFIED_SHAPE'));return true});assert.equal(reviewer,0);
});
test('P1: deterministic equivalent never bypasses hard reviewer rejection',async()=>{
 const c=backend();let reviewer=0;c.generateDraftQuestions=async()=>({questions:[{...question}]});c.callDeepSeek=async()=>{reviewer++;return {...review(question),solution_correct:false}};
 await assert.rejects(c.generateQuestions('test',{}),e=>e.code==='GENERATION_REJECTED');assert.equal(reviewer,2);
});
test('P1: generation prompt includes supported high derivative families, integral substitution check and retry feedback',async()=>{
 const c=backend();let prompt;
 c.callDeepSeek=async(k,messages)=>{prompt=messages[1].content;return {questions:[{...question}]}};
 await c.generateDraftQuestions('test',{plans:[{module:'derivative',targetDifficulty:12,topic:'复合函数求导'}],regenerationFeedback:{reasons:['UNVERIFIED_SHAPE'],previous_expression:'bad'},avoidPrompts:['bad']});
 for(const phrase of ['targetDifficulty: 12','不定积分在提交前必须对最终原函数','高难导数可组合','UNVERIFIED_SHAPE','仅换常数','点值求导题'])assert.ok(prompt.includes(phrase),phrase);
});
test('P1: domain-aware indefinite integral self-check retains wrong-factor and constant guards',()=>{
 const q={module:'integral',expression:'\\int\\frac{1}{x-3}\\,dx'};
 assert.equal(Q.verifyAnswerAgainstQuestion(q,'\\ln|x-3|+C'),'equivalent');
 assert.equal(Q.verifyAnswerAgainstQuestion(q,'2\\ln|x-3|+C'),'not_equivalent');
 assert.equal(Q.verifyAnswerAgainstQuestion({...q,expression:'\\int x\\,dx'},'0+C'),'not_equivalent');
});
