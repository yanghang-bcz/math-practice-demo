/* 独立数学复核
 *
 * 用项目自己的确定性引擎（math-quality.js）当 oracle，但它跟服务端跑的是
 * 同一份代码 —— 所以它证明的是「服务端的闸门有没有执行、结果是否被改动」，
 * 不是「换了个人重算一遍」。这一点在报告里必须写清楚，不能含糊。
 *
 * 真正独立于模型的那部分判断在这里：
 *   Q.issues(q) 会把 q.answer 代回题目做数值验证（ANSWER_FAILS_VERIFICATION），
 *   并抽取解析里的最终答案与 q.answer 对撞（SOLUTION_MISMATCH）。
 *   这两条能抓出「答案算错却过了闸门」这一类事故。
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Q = require('../../math-quality.js');

export const ENGINE_VERSION = Q.VERSION;

/** 抽取解析里声称的最终答案，供报告里人工复核 */
export function claimedAnswerInSolution(solution) {
  const text = String(solution || '');
  const matches = [
    ...text.matchAll(
      /(?:最终答案|答案|极限|结果|因此)(?:为|是|等于|[:：])\s*(\$[^$]+\$|\\\([^\n]+?\\\)|[^\n。；，]{0,40}?)(?=[。；，\n]|$)/g
    )
  ];
  return matches
    .map((m) => m[1].trim())
    .filter(Boolean)
    .slice(-3);
}

/** 对一道「服务端已放行」的题做独立复核 */
export function checkQuestion(q) {
  if (!q || typeof q !== 'object') {
    return {
      ok: false,
      issues: ['NO_QUESTION'],
      approved: false,
      answer_verifies: 'uncertain',
      solution_mismatch: false,
      answer_fails_verification: false,
      snapshot_intact: false,
      claimed_in_solution: []
    };
  }

  let issues = [];
  let approved = false;
  let answerVerifies = 'uncertain';
  let snapshotIntact = false;

  try {
    issues = Q.issues(q);
  } catch (error) {
    issues = ['ENGINE_THREW:' + (error?.message || 'unknown')];
  }

  try {
    approved = Q.approved(q);
  } catch {
    approved = false;
  }

  try {
    answerVerifies = Q.verifyAnswerAgainstQuestion(q, String(q.answer ?? ''));
  } catch {
    answerVerifies = 'uncertain';
  }

  try {
    snapshotIntact = Q.content(q) === q?.verification?.content;
  } catch {
    snapshotIntact = false;
  }

  return {
    ok: issues.length === 0,
    issues,
    approved,
    answer_verifies: answerVerifies,
    solution_mismatch: issues.includes('SOLUTION_MISMATCH'),
    answer_fails_verification: issues.includes('ANSWER_FAILS_VERIFICATION'),
    question_invalid: issues.includes('QUESTION_INVALID'),
    answer_invalid: issues.includes('ANSWER_INVALID'),
    snapshot_intact: snapshotIntact,
    claimed_in_solution: claimedAnswerInSolution(q.solution)
  };
}

/** 「错误批准」的定义：引擎能明确判出这道题的答案不满足题目（not_equivalent），
 *  而服务端却把它当成合格题返回了。这是最严重的一类 —— 会直接送到用户面前。 */
export function isWrongApproved(check) {
  return (
    check.answer_verifies === 'not_equivalent' ||
    check.answer_fails_verification ||
    check.solution_mismatch ||
    check.answer_invalid
  );
}

/** 较轻的一类：题目结构有问题（缺字段、模块不对） */
export function isStructurallyBad(check) {
  return check.question_invalid || check.issues.includes('NO_QUESTION');
}

export { Q };
