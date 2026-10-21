import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];
if(!args.includes('--live'))throw new Error('No network request made. Explicit --live is required for post-deployment read-only checks.');
for(const key of ['--api-url','--site-url','--manifest'])if(!args.includes(key))throw new Error(`Missing ${key}`);
const api=new URL(get('--api-url')),site=new URL(get('--site-url'));
for(const u of [api,site])if(u.username||u.password||u.protocol!=='https:')throw new Error('Use public HTTPS URLs without credentials');
const manifest=JSON.parse(fs.readFileSync(get('--manifest'),'utf8'));
const checks=[],headers={Origin:site.origin};
const healthURL=new URL(api);healthURL.searchParams.set('health','1');
const start=performance.now();
const health=await fetch(healthURL,{headers,cache:'no-store',signal:AbortSignal.timeout(10000)});
const data=await health.json();
checks.push({name:'configured_health',pass:health.ok&&data.ok===true,duration_ms:performance.now()-start});
checks.push({name:'delivery_contract',pass:data.delivery_contract==='v1.2-safe-merge'&&data.request_budget_ms===30000&&data.gate_policy==='strict-tier-b'});
const allow=health.headers.get('access-control-allow-origin');checks.push({name:'health_origin',pass:allow==='*'||allow===site.origin,value:allow});
const preflight=await fetch(api,{method:'OPTIONS',headers:{...headers,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},signal:AbortSignal.timeout(10000)});
const preflightOrigin=preflight.headers.get('access-control-allow-origin');
checks.push({name:'post_preflight',pass:preflight.ok&&(preflightOrigin==='*'||preflightOrigin===site.origin)&&/post/i.test(preflight.headers.get('access-control-allow-methods')||'')&&/content-type/i.test(preflight.headers.get('access-control-allow-headers')||'')});
for(const file of ['app.js','math-quality.js']){
 const url=new URL(file,site.href.endsWith('/')?site.href:site.href+'/');
 const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});
 const hash=createHash('sha256').update(new Uint8Array(await response.arrayBuffer())).digest('hex');
 checks.push({name:`static_sha256:${file}`,pass:response.ok&&hash===manifest.files[file].sha256,sha256:hash});
}
const result={scope:'Read-only public health, CORS and static hashes; no model calls, no deployment',checked_at:new Date().toISOString(),checks,
 backend_build_hash_verified:false,limits:['Health is not a model availability test. Confirm backend ZIP hash in the deployment record.', 'Cold-start/platform margin, account sync and billing require separate controlled acceptance.']};
if(args.includes('--out')){fs.mkdirSync(path.dirname(get('--out')),{recursive:true});fs.writeFileSync(get('--out'),JSON.stringify(result,null,2));}
console.log(JSON.stringify(result,null,2));if(checks.some(c=>!c.pass))process.exitCode=1;
