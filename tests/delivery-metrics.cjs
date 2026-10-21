'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('metrics measure actual displayed slots and keep quality separate from network',async()=>{
 const {analyze}=await import('../tools/reliability-metrics.mjs');
 const result=analyze({source:'natural',requests:[
  {action:'generate',request_id:'r1',completed:true,http_status:200},
  {action:'generate',request_id:'r2',completed:true,http_status:422,code:'GENERATION_REJECTED',stage:'quality'},
  {action:'generate',request_id:'r3',completed:true,fetch_error:'TypeError'},
  {action:'generate',request_id:'r4',completed:true,http_status:200}],
  records:[{event:'question_ready',source:'ai',origin:'prefetch',request_id:'r1'},{event:'question_ready',source:'ai',origin:'prefetch',request_id:'unused'}],
  visible:[{session_id:'s',question_sequence:0,question_id:'q1',request_id:'r1',module:'limit',source:'ai',origin:'prefetch',first_wait_ms:500},
  {session_id:'s',question_sequence:1,question_id:'q2',module:'limit',source:'fallback',bank_id:'fb-1'},
  {session_id:'s',question_sequence:1,question_id:'q2',module:'limit',source:'fallback',bank_id:'fb-1'},
  {session_id:'s',question_sequence:2,question_id:'q3',module:'limit',source:'fallback',bank_id:'fb-1'}],clicks:[{displayed:true}]},
  {method:'independent',rows:[{question_id:'q1',verdict:'correct'}]});
 assert.equal(result.browser_network_failure_rate,.25);assert.equal(result.final_quality_rejection_rate,.25);assert.equal(result.displayed_slots,3);
 assert.equal(result.displayed_fallback_rate,2/3);assert.equal(result.prefetch_utilization,.5);assert.equal(result.repeat_fallback_rate,.5);assert.equal(result.first_wait_p95_ms,500);assert.equal(result.independent_math_correct_rate,1);
});
test('missing denominators and undelivered starts are not hidden by HTTP success',async()=>{
 const {analyze}=await import('../tools/reliability-metrics.mjs');
 const result=analyze({source:'natural',requests:[],records:[],visible:[{session_id:'s',question_sequence:0,source:'ai',origin:'prefetch',request_id:'missing',first_wait_ms:10}],clicks:[{displayed:false}]});
 assert.equal(result.prefetch_utilization,null);assert.equal(result.first_wait_p95_ms,null);assert.equal(result.independent_math_correct_rate,null);assert.equal(result.starts_without_display,1);
 assert.throws(()=>analyze({source:'injected'}));assert.throws(()=>analyze({source:'natural',truncated:true}));
});
