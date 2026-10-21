'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {createRequire}=require('node:module');const fs=require('node:fs');
test('real 30-second handler deadline returns structured timeout before the 35-second platform cap', {timeout:34500}, async()=>{
 const c=vm.createContext({require:createRequire(path.resolve('api/deepseek.js')),module:{exports:{}},process:{env:{DEEPSEEK_API_KEY:'test'}},console:{log(){},warn(){},error(){}},AbortController,AbortSignal,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync('api/deepseek.js','utf8'),c);
 c.generateDraftQuestions=async()=>new Promise(()=>{});
 let status,data;const res={setHeader(){},status(s){status=s;return this},json(d){data=d;return this}};
 const start=performance.now();
 await c.module.exports({method:'POST',body:{action:'generate',request_id:'deadline-30s'}},res);
 const elapsed=performance.now()-start;
 assert.ok(elapsed>=29000 && elapsed<34000,`elapsed=${elapsed}`);
 assert.equal(status,424);assert.equal(data.code,'UPSTREAM_TIMEOUT');assert.equal(data.retryable,false);assert.equal(data.request_id,'deadline-30s');
 console.log(JSON.stringify({elapsed_ms:elapsed,http_status:status,code:data.code,platform_cap_ms:35000,kind:'real local wall-clock, upstream stall injected'}));
});
