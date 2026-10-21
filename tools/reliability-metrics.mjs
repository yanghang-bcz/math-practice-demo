import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const rate = (n,d) => d ? n/d : null;
const p95 = xs => xs.length ? [...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*.95)-1] : null;
export function analyze(data, review = {method:'independent',rows:[]}) {
  if(data.source !== 'natural') throw new Error('Injected/test observations cannot be reported as natural production rates');
  if(data.truncated) throw new Error('Trace truncated: export smaller batches; missing denominator is not acceptable');
  const requests=(data.requests||[]).filter(r=>r.action==='generate');
  const logical=new Map();let missingIdentity=0;for(const r of requests){if(r.request_id)logical.set(r.request_id,r);else missingIdentity++;}
  const slots=new Map();for(const e of data.visible||[])slots.set(`${e.session_id}:${e.question_sequence}`,e);
  const shown=[...slots.values()],fallback=shown.filter(e=>e.source==='fallback');
  const failedNetwork=r=>r.fetch_error==='TypeError'||r.body_error==='TypeError';
  const timedOut=r=>/Abort|Timeout/.test(r.fetch_error||r.body_error||'');
  const rejected=r=>r.stage==='quality'||/^(GENERATION_|UNVERIFIED_|CANONICAL_|ANSWER_|SOLUTION_)/.test(r.code||'');
  const successfulPrefetch=new Set((data.records||[]).filter(e=>e.event==='question_ready'&&e.source==='ai'&&['warmup','prefetch'].includes(e.origin)).map(e=>e.request_id));
  const usedPrefetch=new Set(shown.filter(e=>e.source==='ai'&&['warmup','prefetch'].includes(e.origin)).map(e=>e.request_id));
  const missingReady=[...usedPrefetch].filter(id=>!successfulPrefetch.has(id));
  let repeated=0, adjacent=0;const history=new Map();
  for(const e of fallback){const seen=history.get(e.module)||[];if(seen.includes(e.bank_id))repeated++;if(seen.at(-1)===e.bank_id)adjacent++;history.set(e.module,[...seen,e.bank_id].slice(-20));}
  const waits=shown.map(e=>e.first_wait_ms).filter(Number.isFinite);
  const undisplayed=(data.clicks||[]).filter(c=>!c.displayed&&!c.cancelled_by_new_start).length;
  if((review.rows||[]).length && review.method!=='independent')throw new Error('Mathematical correctness requires an independently reviewed sample');
  const displayedAI=new Set(shown.filter(e=>e.source==='ai').map(e=>e.question_id));
  const reviews=new Map();for(const r of review.rows||[])if(displayedAI.has(r.question_id))reviews.set(r.question_id,r);
  const rows=[...reviews.values()];
  return { source:'natural',http_generation_attempts:requests.length,logical_generation_requests:logical.size,requests_without_identity:missingIdentity,incomplete_requests:requests.filter(r=>!r.completed).length,
    browser_network_failure_rate:rate(requests.filter(failedNetwork).length,requests.length),browser_timeout_rate:rate(requests.filter(timedOut).length,requests.length),
    server_to_model_network_failure_rate:rate(requests.filter(r=>r.code==='UPSTREAM_UNREACHABLE').length,requests.length),
    final_quality_rejection_rate:missingIdentity||requests.some(r=>!r.completed)?null:rate([...logical.values()].filter(rejected).length,logical.size),
    displayed_slots:shown.length,displayed_fallbacks:fallback.length,displayed_fallback_rate:rate(fallback.length,shown.length),
    displayed_ai_rate:rate(shown.length-fallback.length,shown.length),
    successful_prefetches:successfulPrefetch.size,used_prefetches:usedPrefetch.size,
    missing_ready_events:missingReady.length,prefetch_utilization:missingReady.length?null:rate(usedPrefetch.size,successfulPrefetch.size),
    first_question_wait_samples:waits.length,first_wait_mean_ms:waits.length?waits.reduce((a,b)=>a+b,0)/waits.length:null,
    first_wait_p95_ms:undisplayed?null:p95(waits),first_wait_observed_only_p95_ms:p95(waits),starts_without_display:undisplayed,
    repeat_fallback_rate:fallback.some(e=>!e.bank_id)?null:rate(repeated,fallback.length),adjacent_repeat_fallback_rate:fallback.some(e=>!e.bank_id)?null:rate(adjacent,fallback.length),
    independently_reviewed:rows.length,independently_correct:rows.filter(r=>r.verdict==='correct').length,
    independent_math_correct_rate:rate(rows.filter(r=>r.verdict==='correct').length,rows.length),
    independently_uncertain:rows.filter(r=>r.verdict==='uncertain').length,
    release_blockers:rows.filter(r=>r.verdict==='incorrect').map(r=>({question_id:r.question_id,reason:'independent math error'})),
    limits:['Browser-to-gateway and server-to-model failures are separate. Candidate rejection/call success require correlated server spans.',
      'Zero failure observations do not prove zero long-term failure probability. HTTP200 is not an AI delivery metric.'] };
}
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];
  if(!args.includes('--events'))throw new Error('Usage: node tools/reliability-metrics.mjs --events trace.json [--review independent-review.json] [--out result.json]');
  const result=analyze(JSON.parse(fs.readFileSync(get('--events'),'utf8')),args.includes('--review')?JSON.parse(fs.readFileSync(get('--review'),'utf8')):undefined);
  if(args.includes('--out')){fs.mkdirSync(path.dirname(get('--out')),{recursive:true});fs.writeFileSync(get('--out'),JSON.stringify(result,null,2));}
  console.log(JSON.stringify(result,null,2));
}
