const test = require('node:test');
const assert = require('node:assert/strict');
const { extractJsonObject, validateDataPlan } = require('../lib/dataAgent');

test('data agent extracts JSON despite think tags and markdown fences', () => {
  const parsed = extractJsonObject('<think>วิเคราะห์</think>```json\n{"dataset":"team","action":"compare","people":["แพด","เหมี่ยว"]}\n```');
  assert.equal(parsed.dataset, 'team');
  assert.deepEqual(parsed.people, ['แพด', 'เหมี่ยว']);
});

test('data agent accepts only the read-only query DSL', () => {
  assert.deepEqual(validateDataPlan({
    dataset: 'team', action: 'compare', people: ['แพด', 'เหมี่ยว'],
    fromDate: '2026-07-01', toDate: '2026-07-31',
  }), {
    dataset: 'team', action: 'compare', people: ['แพด', 'เหมี่ยว'],
    fromDate: '2026-07-01', toDate: '2026-07-31', status: null,
    keyword: null, targetPoints: null, clarification: null,
  });
  assert.equal(validateDataPlan({ dataset: 'users', action: 'delete', people: [] }), null);
});

test('score gap plan asks for a target instead of inventing one', () => {
  const plan = validateDataPlan({ dataset: 'team', action: 'score_gap', people: ['แพด', 'เหมี่ยว'], targetPoints: null });
  assert.equal(plan.targetPoints, null);
  assert.match(plan.clarification, /เป้าหมายกี่คะแนน/);
});
