'use strict';

/* =========================================================
   Task 5F：客户端重试 / 退避 / 超时收敛
   =========================================================

   旧的客户端预算是「出题 190 秒、其余 50 秒，且一次都不重试」。两头都不对：
   三分半的等待换来的是用户盯着 loading，而出题失败时立刻可用的备用题库
   就在旁边；反过来，一次握手抖动就直接掉进备用题，明明再试一次就成功。

   这一组钉住三件事：
     · 等待有硬上界（单次超时 + 整体预算），不再出现三分钟的等待
     · 该重试的（网络、429、5xx、判题超时）重试一次，退避 600~1200ms
     · 不该重试的（4xx、协议错误、出题超时）一次都不重试，直接交给备用题库
   ========================================================= */

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const Q=require('../math-quality');
const support=require('../tools/test-support.cjs');

const source=support.read('app.js');

const API_TIMEOUTS=support.constObjectFrom(source,'API_TIMEOUTS');
const API_RETRY=support.constObjectFrom(source,'API_RETRY');
const API_BUDGETS=support.constObjectFrom(source,'API_BUDGETS');
const RETRY_BASE_MS=support.constNumberFrom(source,'RETRY_BASE_MS');
const RETRY_JITTER_MS=support.constNumberFrom(source,'RETRY_JITTER_MS');

/* =========================================================
   1. 预算本身就应该是被锁住的对象
   ========================================================= */

test('★ 出题等待必须有上界：不再出现 180~190 秒的等待',()=>{
  assert.ok(API_TIMEOUTS.generate <= 60000,
    `单次出题超时 ${API_TIMEOUTS.generate}ms —— 超过一分钟就说明预算还没收敛`);
  assert.ok(API_TIMEOUTS.judge <= 25000,
    `单次判题超时 ${API_TIMEOUTS.judge}ms —— 判题是短调用，超了就该退到重试`);
  assert.ok(API_TIMEOUTS.evaluate <= 25000);

  // 真正让用户等多久的是「整体预算」，不是单次超时
  assert.ok(API_BUDGETS.generate <= 90000,
    `出题整体预算 ${API_BUDGETS.generate}ms 仍然让用户干等`);
  assert.ok(API_BUDGETS.judge <= 45000);

  for(const [action,budget] of Object.entries(API_BUDGETS)){
    assert.ok(budget>=5000,`${action} 的整体预算小到连一次正常往返都放不下`);
  }
});

test('重试次数与退避区间是明确的，不是随手写的数',()=>{
  assert.equal(API_RETRY.generate.attempts,2,'出题应当允许一次重试');
  assert.equal(API_RETRY.judge.attempts,2,'判题应当允许一次重试');
  assert.equal(API_RETRY.evaluate.attempts,1,'难度标定失败不影响出题，不必重试');

  assert.equal(RETRY_BASE_MS,600);
  assert.equal(RETRY_JITTER_MS,600);
});

/* =========================================================
   2. apiCall 的真实行为
   ========================================================= */

function harness(fetchImpl){
  const fn=support.appSlice(source);

  const slept=[];         // 记录退避时长（不真的等）
  const requests=[];

  const context=vm.createContext({
    MathQuality:Q,
    ...support.diagContextBits(source),
    AI_API_URL:'https://example.test/api/deepseek',
    API_TIMEOUTS,
    API_RETRY,
    API_BUDGETS,
    RETRY_BASE_MS,
    RETRY_JITTER_MS,
    AbortController,
    setTimeout,
    clearTimeout,
    JSON,
    Date,
    Number,
    Math,
    Promise,

    sleep:ms=>{slept.push(ms);return Promise.resolve();},

    fetch:async(url,options)=>{
      const body=JSON.parse(options.body);
      requests.push({body,signal:options.signal});
      return fetchImpl({body,options,index:requests.length-1});
    },

    console:{log(){},warn(){},error(){}}
  });

  for(const name of [...support.DIAG_FUNCTIONS,'nextRequestId','retryDelay','apiTimeoutError','apiFailureKind','apiRetryable','apiCall']){
    vm.runInContext(fn(name),context);
  }

  return {c:context,slept,requests};
}

const ok=data=>async()=>({
  ok:true,
  status:200,
  json:async()=>data
});

const status=(code,body={})=>async()=>({
  ok:false,
  status:code,
  json:async()=>({error:'boom',...body})
});

test('★ 连接类失败必须重试一次，并退避 600~1200ms',async()=>{
  const h=harness(status(503));

  await assert.rejects(h.c.apiCall('generate',{}));

  assert.equal(h.requests.length,2,'5xx 只试一次就放弃，等于把一次抖动放大成一次失败');
  assert.equal(h.slept.length,1,'重试之间必须有退避');
  assert.ok(h.slept[0]>=600&&h.slept[0]<=1200,`退避 ${h.slept[0]}ms 不在 600~1200ms 区间`);
});

test('★ 参数错误不重试：重试多少次都是同一个结果',async()=>{
  const h=harness(status(400));

  await assert.rejects(h.c.apiCall('generate',{}),error=>{
    assert.equal(error.httpStatus,400);
    return true;
  });

  assert.equal(h.requests.length,1);
  assert.equal(h.slept.length,0);
});

test('★ 出题超时不重试 —— 重试只会把等待翻倍，随后就会被预算掐掉',async()=>{
  const h=harness(async()=>{
    const error=new Error('aborted');
    error.name='AbortError';
    throw error;
  });

  await assert.rejects(h.c.apiCall('generate',{}, {timeoutMs:1500}),error=>{
    assert.equal(error.code,'CLIENT_TIMEOUT');
    assert.equal(error.timeoutMs,1500);
    return true;
  });

  assert.equal(h.requests.length,1,'出题超时后又打了一次 —— 用户要为此多等一个满额超时');
  assert.equal(h.slept.length,0);

  // 超时有下限：低于 1 秒的超时会把正常往返也掐掉，等于把「慢」误报成「断」
  await assert.rejects(h.c.apiCall('generate',{}, {timeoutMs:20}),error=>{
    assert.equal(error.timeoutMs,1000);
    return true;
  });
});

test('★ 判题超时要重试 —— 判题预算小，再试一次是划算的',async()=>{
  const h=harness(async()=>{
    const error=new Error('aborted');
    error.name='AbortError';
    throw error;
  });

  await assert.rejects(h.c.apiCall('judge',{}, {timeoutMs:10,attempts:2}));

  assert.equal(h.requests.length,2);
  assert.equal(h.slept.length,1);
});

test('★ 网络层中断（fetch 直接抛）必须重试',async()=>{
  let calls=0;
  const h=harness(async()=>{
    calls++;
    if(calls===1)throw new TypeError('Failed to fetch');
    return {ok:true,status:200,json:async()=>({ok:true})};
  });

  const result=await h.c.apiCall('judge',{});

  assert.deepEqual(result,{ok:true});
  assert.equal(h.requests.length,2);
  assert.equal(h.slept.length,1);
});

test('★ 整体预算必须掐住「重试 + 超时」的总时长',async()=>{
  // 每次都快速失败，但整体预算只有 1.2s —— 退避之后已经放不下一次新尝试
  const h=harness(async()=>{
    const error=new Error('boom');
    error.name='TypeError';
    throw error;
  });

  await assert.rejects(h.c.apiCall('generate',{}, {timeoutMs:100,budgetMs:1200,attempts:4}));

  assert.ok(h.requests.length<4,`预算没有生效，实际打了 ${h.requests.length} 次`);
  assert.ok(h.slept.every(ms=>ms<=1200));
});

test('返回体不是 JSON 时报协议错误，且不重试',async()=>{
  const h=harness(async()=>({ok:true,status:200,json:async()=>{throw new Error('not json');}}));

  await assert.rejects(h.c.apiCall('generate',{}),error=>{
    assert.equal(error.code,'CLIENT_PROTOCOL_ERROR');
    return true;
  });

  assert.equal(h.requests.length,1,'协议错误重试也没用，只会拖时间');
});

/* =========================================================
   3. 请求身份必须真的发出去
   ========================================================= */

test('每次请求都带 request_id / session_id / question_sequence / attempt',async()=>{
  const h=harness(ok({questions:[]}));

  await h.c.apiCall('generate',{session_id:'sess-7',question_sequence:3});

  const sent=h.requests[0].body;
  assert.match(sent.request_id,/^generate-/);
  assert.equal(sent.session_id,'sess-7');
  assert.equal(sent.question_sequence,3);
  assert.equal(sent.attempt,1);
  assert.equal(sent.action,'generate');
});

test('重试时 request_id 不变、attempt 递增 —— 服务端才认得出这是同一次请求的重试',async()=>{
  const h=harness(status(500));

  await assert.rejects(h.c.apiCall('generate',{}));

  assert.equal(h.requests[0].body.request_id,h.requests[1].body.request_id);
  assert.equal(h.requests[0].body.attempt,1);
  assert.equal(h.requests[1].body.attempt,2);
});

test('退避本身带抖动，且永远落在区间内',()=>{
  const h=harness(ok({}));
  const samples=new Set();

  for(let i=0;i<200;i++){
    const delay=h.c.retryDelay(i);
    assert.ok(delay>=600&&delay<=1200,`退避 ${delay}ms 越界`);
    samples.add(delay);
  }

  assert.ok(samples.size>1,'退避没有抖动 —— 多标签页会同时重试形成尖峰');
});

/* =========================================================
   4. 失败分类（Task 5H 的失败码表）
   ========================================================= */

test('失败必须分类，不能一律记成「出题失败」',()=>{
  const h=harness(ok({}));
  const K=h.c.FAILURE_KINDS;

  assert.equal(h.c.apiFailureKind('generate',{httpStatus:500}),K.GENERATE_HTTP);
  assert.equal(h.c.apiFailureKind('generate',{name:'AbortError'}),K.GENERATE_TIMEOUT);
  assert.equal(h.c.apiFailureKind('generate',{code:'CLIENT_PROTOCOL_ERROR'}),K.GENERATE_PROTOCOL);
  assert.equal(h.c.apiFailureKind('generate',new TypeError('Failed to fetch')),K.GENERATE_NETWORK);

  assert.equal(h.c.apiFailureKind('judge',{httpStatus:500}),K.JUDGE_HTTP);
  assert.equal(h.c.apiFailureKind('judge',{name:'TimeoutError'}),K.JUDGE_TIMEOUT);
  assert.equal(h.c.apiFailureKind('judge',{code:'CLIENT_PROTOCOL_ERROR'}),K.JUDGE_PROTOCOL);
  assert.equal(h.c.apiFailureKind('judge',new TypeError('x')),K.JUDGE_NETWORK);
});

test('可重试判定：429/5xx/超时/连接中断可重试，其余 4xx 不可',()=>{
  const h=harness(ok({}));

  for(const code of [429,408,500,502,503]){
    assert.equal(h.c.apiRetryable('judge',{httpStatus:code}),true,`${code} 应该可重试`);
  }
  for(const code of [400,401,403,404,422]){
    assert.equal(h.c.apiRetryable('judge',{httpStatus:code}),false,`${code} 不该重试`);
  }

  assert.equal(h.c.apiRetryable('judge',{name:'AbortError'}),true,'判题超时可重试');
  assert.equal(h.c.apiRetryable('generate',{name:'AbortError'}),false,'出题超时不重试');
  assert.equal(h.c.apiRetryable('generate',{code:'CLIENT_PROTOCOL_ERROR'}),false);
});
