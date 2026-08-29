const test = require('node:test');
const assert = require('node:assert/strict');
const { extractJsonObject, requestDataPlan, validateDataPlan } = require('../lib/dataAgent');

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

test('requestDataPlan returns null when providerUrl or apiKey is missing', async () => {
  assert.equal(await requestDataPlan({ providerUrl: null, apiKey: 'key' }), null);
  assert.equal(await requestDataPlan({ providerUrl: 'https://thaillm.or.th', apiKey: null }), null);
});

test('requestDataPlan requests data plan using specified model', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let capturedBody = null;
    let capturedHeaders = null;
    globalThis.fetch = async (url, options) => {
      capturedBody = JSON.parse(options.body);
      capturedHeaders = options.headers;
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                dataset: 'tasks',
                action: 'list',
                people: ['แพด'],
                status: 'กำลังทำ',
              }),
            },
          }],
        }),
      };
    };

    const plan = await requestDataPlan({
      providerUrl: 'https://thaillm.or.th/api/v1/chat/completions',
      apiKey: 'test-api-key',
      model: 'qwen3.6-35b-a3b',
      question: 'งานที่กำลังทำของแพด',
      messages: [{ role: 'user', content: 'งานที่กำลังทำของแพด' }],
      currentDate: '2026-08-28',
    });

    assert.equal(capturedBody.model, 'qwen3.6-35b-a3b');
    assert.equal(capturedHeaders.Authorization, 'Bearer test-api-key');
    assert.deepEqual(plan, {
      dataset: 'tasks',
      action: 'list',
      people: ['แพด'],
      fromDate: null,
      toDate: null,
      status: 'กำลังทำ',
      keyword: null,
      targetPoints: null,
      clarification: null,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestDataPlan handles upstream HTTP errors gracefully', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 502,
    });

    const plan = await requestDataPlan({
      providerUrl: 'https://thaillm.or.th/api/v1/chat/completions',
      apiKey: 'test-api-key',
      model: 'qwen3.6-35b-a3b',
      question: 'ทดสอบ',
      messages: [],
      currentDate: '2026-08-28',
    });

    assert.equal(plan, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
