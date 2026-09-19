/* Shared, dependency-free reliability rules (browser and Node). */
(function(root) {
  'use strict';
  const VERSION = 'quality-v1';
  const fields = ['question_valid','answer_correct','solution_correct','answer_solution_consistent','topic_match','difficulty_reasonable'];
  function normalize(v) {
    return String(v ?? '').normalize('NFKC').trim().replace(/[−–]/g,'-')
      .replace(/\\(?:left|right)/g,'').replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,'($1)/($2)')
      .replace(/\\infty/g,'∞').replace(/\\[()[\]]|\$/g,'').replace(/\s+/g,'');
  }
  function atom(v) {
    const s=normalize(v).toLowerCase();
    if (['不存在','极限不存在','无极限','dne','doesnotexist'].includes(s)) return {kind:'dne'};
    if (['+∞','∞','+infinity','infinity','正无穷','正无穷大','+无穷'].includes(s)) return {kind:'positiveInfinity'};
    if (['-∞','-infinity','负无穷','负无穷大','-无穷'].includes(s)) return {kind:'negativeInfinity'};
    // Unsigned Chinese infinity/divergence is ambiguous; never equate it with DNE or signed infinity.
    if (['无穷','无穷大','发散','±∞'].includes(s)) return {kind:'ambiguous'};
    const number='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
    let m=s.match(new RegExp('^\\(?('+number+')\\)?/\\(?('+number+')\\)?$'));
    let n;
    if(m) { if(Number(m[2])===0)return {kind:'invalid'}; n=Number(m[1])/Number(m[2]); }
    else if(new RegExp('^'+number+'%?$').test(s)) n=Number(s.replace('%',''))/(s.endsWith('%')?100:1);
    else return null;
    return Number.isFinite(n)?{kind:'number',value:n}:{kind:'invalid'};
  }
  function rational(v) {
    const s=normalize(v).toLowerCase();
    function decimal(t) {
      const m=t.replace(/[()]/g,'').match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/);
      if(!m || !(m[2]||m[3]) || Math.abs(Number(m[4]||0))>1000 || t.length>2000)return null;
      const shift=Number(m[4]||0)-(m[3]||'').length;
      let n=BigInt((m[2]||'0')+(m[3]||''))*(m[1]==='-'?-1n:1n),d=1n;
      if(shift>=0)n*=10n**BigInt(shift);else d=10n**BigInt(-shift);
      return [n,d];
    }
    const parts=s.replace(/%$/,'').split('/');
    const a=decimal(parts[0]),b=parts.length===2?decimal(parts[1]):[1n,1n];
    if(!a || !b || b[0]===0n || parts.length>2)return null;
    return [a[0]*b[1],a[1]*b[0]*(s.endsWith('%')?100n:1n)];
  }
  function compare(a,b) {
    const x=atom(a),y=atom(b);
    if([x,y].some(z=>z && ['ambiguous','invalid'].includes(z.kind))) return 'uncertain';
    if(x && y) {
      if(x.kind!==y.kind)return 'not_equivalent';
      if(x.kind!=='number')return 'equivalent';
      const ra=rational(a),rb=rational(b);
      if(!ra || !rb)return 'uncertain';
      return ra[0]*rb[1]===rb[0]*ra[1]?'equivalent':'not_equivalent';
    }
    return 'uncertain';
  }
  function content(q) {return JSON.stringify([q.module,q.topic,q.instruction||'',q.expression||'',q.prompt||'',String(q.answer??''),q.solution||'']);}
  function issues(q) {
    const out=[];
    if(!q || !['limit','derivative','integral'].includes(q.module) || !(q.expression||q.prompt) || !String(q.answer??'').trim() || !q.solution) out.push('INVALID_QUESTION');
    if(/需要重新设计|题目有误|题目错误|答案不对|无法作答|条件不足/.test(q.solution||''))out.push('INVALID_QUESTION');
    if(atom(q.answer)?.kind==='invalid')out.push('INVALID_ANSWER');
    const matches=[...(q.solution||'').matchAll(/(?:最终答案|答案|极限|结果)(?:为|是|等于|[:：])\s*(\\\([^\n]+?\\\)|[+\-]?\d+(?:\.\d+)?(?:\/\d+)?)(?=[。；，\s]|$)/g)];
    if(matches.some(m=>compare(m[1],q.answer)==='not_equivalent'))out.push('ANSWER_SOLUTION_MISMATCH');
    return out;
  }
  function approved(q) {
    const v=q?.verification;
    return !!(v && v.version===VERSION && v.status==='approved' && fields.every(k=>v[k]===true) && typeof v.confidence==='number' && v.confidence>=0.9 && v.confidence<=1 && Array.isArray(v.issues) && v.issues.length===0 && v.content===content(q) && issues(q).length===0);
  }
  const api={VERSION,fields,normalize,atom,compare,content,issues,approved};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  else root.MathQuality=api;
})(typeof globalThis!=='undefined'?globalThis:this);
