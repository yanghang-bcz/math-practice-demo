'use strict';

/* =========================================================
   Task 5I：健康检查与协议校验
   =========================================================

   旧的健康检查只做一件事：res.ok。于是不管线上跑的是哪一版引擎，
   界面都写「DeepSeek 已连接」。而劈叉部署下最危险的状态恰恰是「连接正常」——
   界面越平静，问题越难被发现。

   这一组钉住：
     · 版本不匹配必须被识别出来（而不是只报一个「已连接」）
     · 一次网络抖动 ≠ 版本不匹配（不能因为连不上就永久切到备用题库）
     · 版本不匹配时，服务端的「答对了」结论不得被采信
     · 版本不匹配时不再发无谓的出题请求（等满 60 秒再退备用题毫无价值）
   ========================================================= */

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const Q=require('../math-quality');
const support=require('../tools/test-support.cjs');

const source=support.read('app.js');
const PIPE={protocol:2,generator:'generator-v2',reviewer:'reviewer-v2',judge:'judge-v2',math_engine:Q.VERSION};

function harness({fetchImpl}={}){
  const fn=support.appSlice(source);

  const elements={
    apiStatusText:{textContent:''},
    apiStatusDot:{className:''},
    answerInput:{value:''},
    submitAnswerBtn:{},
    box:{innerHTML:''}
  };

  let apiCalls=0;

  const context=vm.createContext({
    MathQuality:Q,
    FallbackBank:require('../fallback-bank'),
    FALLBACK_BANK:require('../fallback-bank').BANK,
    ...support.diagContextBits(source),
    // 顶层常量（不属于任何函数，所以不在切片里）
    AI_API_URL:support.constLiteralFrom(source,'AI_API_URL'),
    HEALTH_TIMEOUT_MS:30,
    state:{difficultyModel:{version:'v0-provisional'},history:[],profile:{abilityByModule:{}}},
    uid:prefix=>`${prefix}-test`,
    clamp:(value,low,high)=>Math.min(high,Math.max(low,value)),
    calibrateDifficulty:value=>value,
    round2:value=>Math.round(value*100)/100,
    console:{log(){},warn(){},error(){}},
    Date,
    Number,
    JSON,
    Math,
    Promise,
    AbortController,
    setTimeout,
    clearTimeout,
    $:id=>elements[id]||null,
    window:{dispatchEvent(){}},
    CustomEvent:function(){},
    localStorage:{getItem:()=>null,setItem(){}},
    toast(){},
    markApiRequestSuccess(){},
    markApiRequestFailure(){},
    apiCall:async()=>{apiCalls++;throw new Error('网络桩，不该被调到');},
    fetch:fetchImpl||(async()=>{throw new Error('no fetch');})
  });

  for(const name of [...support.DIAG_FUNCTIONS,'nextRequestId','apiFailureKind','apiRetryable','clientPipeline','pipelineMismatch','checkResponseProtocol','knownProtocolMismatch','checkApiHealth','renderApiStatus','freezeQuestion','canonicalIntegrityOf','trustedQuestion','reportQuestionIssue','voidQuestion','judgeUnavailable','judgeAnswer','recentFallbackIds','closestFallback','fallbackQuestion','generateOneQuestion','recentQuestionPrompts','shortApiError']){
    vm.runInContext(fn(name),context);
  }

  return {c:context,elements,apiCalls:()=>apiCalls};
}

const healthResponse=(payload)=>({
  ok:true,status:200,json:async()=>payload
});

const draft=()=>({module:'limit',topic:'重要极限',instruction:'计算极限',
  expression:'\\lim_{x\\to0}\\sin(x)/x',answer:'1',solution:'利用重要极限，结果为 1。'});

/* 判题要落到服务端，题面和答案都得是引擎算不出来的形态。 */
const UNCERTAIN='\\Gamma(x)';

function approved(){
  const q=draft();
  q.verification={...Object.fromEntries(Q.fields.map(k=>[k,true])),confidence:.97,issues:[],
    version:Q.VERSION,status:'approved',content:Q.content(q),pipeline:PIPE};
  q.source='ai';
  return Q.freezeCanonical(q);
}

/* =========================================================
   1. 版本比对本身
   ========================================================= */

test('★ 本机声明自己的协议与引擎版本，不靠猜',()=>{
  const h=harness();
  const pipeline=h.c.clientPipeline();

  assert.equal(pipeline.protocol,PIPE.protocol);
  assert.equal(pipeline.generator,PIPE.generator);
  assert.equal(pipeline.reviewer,PIPE.reviewer);
  assert.equal(pipeline.judge,PIPE.judge);
  assert.equal(pipeline.engine,Q.VERSION,'引擎版本必须取自实际加载的引擎，不能写死');
});

test('★ 版本比对：缺版本、引擎不符、协议不符都要认出来',()=>{
  const h=harness();

  assert.equal(h.c.pipelineMismatch(null).reason,'missing_versions');
  assert.equal(h.c.pipelineMismatch(undefined).reason,'missing_versions');

  assert.equal(h.c.pipelineMismatch({...PIPE,math_engine:'quality-v1'}).reason,'engine_version_mismatch');
  assert.equal(h.c.pipelineMismatch({...PIPE,protocol:1}).reason,'protocol_version_mismatch');

  const ok=h.c.pipelineMismatch(PIPE);
  assert.equal(ok.ok,true);
  assert.equal(ok.reason,'match');
  assert.match(ok.message,/协议 v2/);
});

test('引擎版本优先于协议版本 —— 验证规则由引擎决定',()=>{
  const h=harness();

  // 两个都不对时，先报引擎版本：它才是「能不能相信这份验证」的根据
  const both=h.c.pipelineMismatch({...PIPE,protocol:1,math_engine:'quality-v0'});
  assert.equal(both.reason,'engine_version_mismatch');
});

test('响应版本逐次校验，health 里带的扁平版本号也能用',()=>{
  const h=harness();

  assert.equal(h.c.checkResponseProtocol({versions:PIPE}).ok,true);
  assert.equal(h.c.checkResponseProtocol({pipeline:PIPE}).ok,true);
  assert.equal(h.c.checkResponseProtocol({}).ok,false,'没有版本信息的响应不该被当成可信');
});

/* =========================================================
   2. 健康检查的状态机
   ========================================================= */

test('★ health 正常时：连接正常 + 版本匹配',async()=>{
  const h=harness({fetchImpl:async()=>healthResponse({
    ok:true,service:'deepseek',protocol_version:2,generator_version:PIPE.generator,
    reviewer_version:PIPE.reviewer,judge_version:PIPE.judge,math_engine_version:Q.VERSION,pipeline:PIPE
  })});

  await h.c.checkApiHealth();

  assert.equal(h.c.apiHealthy,true);
  assert.equal(h.c.apiProtocol.ok,true);
  assert.match(h.elements.apiStatusText.textContent,/已连接/);
  assert.match(h.elements.apiStatusText.textContent,/协议 v2/);
});

test('★ health 报旧引擎时：必须显示版本不匹配，而不是「已连接」',async()=>{
  const h=harness({fetchImpl:async()=>healthResponse({
    ok:true,
    pipeline:{protocol:2,generator:'generator-v2',reviewer:'reviewer-v2',judge:'judge-v2',math_engine:'quality-v1'}
  })});

  await h.c.checkApiHealth();

  assert.equal(h.c.apiProtocol.ok,false);
  assert.equal(h.c.apiProtocol.reason,'engine_version_mismatch');
  assert.match(h.elements.apiStatusText.textContent,/版本不匹配/);
  assert.ok(!/^DeepSeek 已连接$/.test(h.elements.apiStatusText.textContent),
    '版本不匹配却显示「已连接」—— 这正是劈叉部署最容易骗过人的地方');
  assert.ok(h.c.diagRecords.some(r=>r.kind==='protocol_mismatch'));
});

test('★ 连不上 ≠ 版本不匹配',async()=>{
  const h=harness({fetchImpl:async()=>{throw new TypeError('Failed to fetch');}});

  await h.c.checkApiHealth();

  assert.equal(h.c.apiHealthy,false);
  assert.equal(h.c.apiProtocol.ok,null,'连不上只是「没测出来」，不能定性成不匹配');
  assert.equal(h.c.apiProtocol.reason,'unreachable');
  assert.equal(h.c.knownProtocolMismatch(),false,'一次网络抖动不该把出题路径永久切到备用题库');
  assert.equal(h.elements.apiStatusText.textContent,'AI 服务未连接');
});

test('健康检查超时也要有上界',async()=>{
  // 真实超时值是生产常量，单独锁一次；下面的断言用毫秒级替身，不会真的等它
  const realTimeout=support.constNumberFrom(source,'HEALTH_TIMEOUT_MS');
  assert.ok(realTimeout>=3000&&realTimeout<=15000,
    `健康检查超时 ${realTimeout}ms —— 太短会误报，太长会拖住冷启动`);

  const h=harness({fetchImpl:(url,options)=>new Promise((resolve,reject)=>{
    options.signal.addEventListener('abort',()=>{
      const error=new Error('aborted');
      error.name='AbortError';
      reject(error);
    });
  })});
  const started=Date.now();

  await h.c.checkApiHealth();

  assert.ok(Date.now()-started<2000,'健康检查居然没有超时 —— 冷启动会卡在这里');
  assert.equal(h.c.apiProtocol.reason,'health_timeout');
  assert.equal(h.c.apiProtocol.ok,null);
  assert.equal(h.c.knownProtocolMismatch(),false);
});

test('knownProtocolMismatch：只有「确定是版本问题」才走短路径',()=>{
  const h=harness();

  assert.equal(h.c.knownProtocolMismatch(),false,'还没测过就不该拦');

  vm.runInContext('apiProtocol={ok:false,reason:"missing_versions"}',h.c);
  assert.equal(h.c.knownProtocolMismatch(),false,'缺版本信息不足以断定不兼容');

  vm.runInContext('apiProtocol={ok:false,reason:"engine_version_mismatch"}',h.c);
  assert.equal(h.c.knownProtocolMismatch(),true);

  vm.runInContext('apiProtocol={ok:null,reason:"unreachable"}',h.c);
  assert.equal(h.c.knownProtocolMismatch(),false);
});

/* =========================================================
   3. 判题：版本不匹配时不得采信「答对了」
   ========================================================= */

test('★ 服务端跑的是另一版引擎时，它的「等价」结论不得被采信',async()=>{
  const h=harness();
  h.c.apiCall=async()=>({
    verdict:'equivalent',trusted:true,method:'deterministic',
    versions:{...PIPE,math_engine:'quality-v0'}
  });

  const result=await h.c.judgeAnswer(approved(),UNCERTAIN);

  assert.equal(result.correct,null,'版本对不上的「答对了」直接放行 —— 这是错答放行率的入口');
  assert.equal(result.trusted,false);
  assert.equal(result.reason,Q.JUDGE_REASONS.JUDGE_UNCERTAIN,'拿不准就保留题目让用户重试，不要判错');
  assert.equal(result.protocol_mismatch,true);
});

test('版本匹配时结论照常采信（闸门不能误伤正常路径）',async()=>{
  const h=harness();
  h.c.apiCall=async()=>({verdict:'equivalent',trusted:true,method:'deterministic',versions:PIPE});

  const result=await h.c.judgeAnswer(approved(),UNCERTAIN);

  assert.equal(result.correct,true);
  assert.equal(result.trusted,true);
});

test('版本匹配时「不等价」同样照常采信',async()=>{
  const h=harness();
  h.c.apiCall=async()=>({verdict:'not_equivalent',trusted:true,method:'deterministic',versions:PIPE});

  const result=await h.c.judgeAnswer(approved(),UNCERTAIN);

  assert.equal(result.correct,false);
  assert.equal(result.trusted,true);
});

test('缺版本信息的判题响应同样不采信「答对了」',async()=>{
  const h=harness();
  h.c.apiCall=async()=>({verdict:'equivalent',trusted:true,method:'deterministic'});

  const result=await h.c.judgeAnswer(approved(),UNCERTAIN);

  assert.equal(result.correct,null);
  assert.equal(result.trusted,false);
});

/* =========================================================
   4. 出题：确定不兼容时不再发无谓请求
   ========================================================= */

test('★ 已确定后端版本不匹配时，出题直接走备用题，不再等满超时',async()=>{
  const h=harness();
  h.c.apiProtocol={ok:false,reason:'engine_version_mismatch',message:'数学引擎版本不一致'};

  const q=await h.c.generateOneQuestion({module:'limit',targetDifficulty:3,purpose:'daily'});

  assert.equal(h.apiCalls(),0,'明知版本不匹配还发请求 —— 用户要为此等满 60 秒');
  assert.equal(q.source,'fallback');
  assert.ok(h.c.diagRecords.some(r=>r.kind==='generate_protocol_error'));
});

/* =========================================================
   5. 后端必须把版本和请求身份回显出来
   ========================================================= */

for(const file of ['api/deepseek.js','cloudbase/deepseek/index.js']){
  test(`${file}: 响应必须回显 request_id 与五个版本号`,()=>{
    const context=vm.createContext({require:require('node:module').createRequire(path.resolve(file)),
      module:{exports:{}},process,console,AbortSignal,
      fetch:async()=>{throw new Error('Unexpected real network');},URL});

    let code=fs.readFileSync(support.ROOT+'/'+file,'utf8');
    if(file.includes('cloudbase')){
      code=code.replace("server.listen(PORT, '0.0.0.0', () => {","if (false) server.listen(PORT, '0.0.0.0', () => {");
    }
    vm.runInContext(code,context);

    const result=context.withResponseMeta({verdict:'uncertain'},{
      request_id:'req-1',session_id:'sess-1',question_sequence:4
    });

    assert.equal(result.request_id,'req-1');
    assert.equal(result.session_id,'sess-1');
    assert.equal(result.question_sequence,4);
    assert.equal(result.versions.protocol,2);
    assert.equal(result.versions.math_engine,Q.VERSION,
      '回显的引擎版本必须就是服务端实际用的那一版');

    // 客户端正是拿这五个字段比对，缺一个就会把正常响应判成协议错误
    for(const key of ['protocol','generator','reviewer','judge','math_engine']){
      assert.ok(key in result.versions,`版本信息里缺 ${key}`);
    }

    // 响应体自带的 versions 不该被覆盖
    const carried=context.withResponseMeta({versions:{...result.versions,judge:'judge-x'}},{request_id:'r'});
    assert.equal(carried.versions.judge,'judge-x');
  });
}
