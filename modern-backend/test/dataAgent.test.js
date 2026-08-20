const test = require('node:test');
const assert = require('node:assert/strict');
const { extractJsonObject, requestDataPlan, validateDataPlan } = require('../lib/dataAgent');

test('data agent extracts JSON despite think tags and markdown fences', () => {
  const parsed = extractJsonObject('<think>วิเคราะห์</think>```json\n{"dataset":"team","action":"compare","people":["แพด","เหมี่ยว"]}\n```');
  assert.equal(parsed.dataset, 'team');
  assert.deepEqual(parsed.people, ['แพด', 'เหมี่ยว']);
  assert.equal(extractJsonObject('```json\n{not-valid}\n```'), null);
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

test('data planner does not call a provider without complete credentials', async () => {
  const plan = await requestDataPlan({
    providerUrl: 'https://provider.example.test/chat',
    apiKey: '',
    question: 'สรุปคะแนนของฉัน',
  });
  assert.equal(plan, null);
});

test('data planner sends a bounded read-only request and validates the response', async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '<think>internal</think>```json\n{"dataset":"briefings","action":"list","people":["แพด","แพด"],"fromDate":"2026-08-01","toDate":"2026-08-20","status":"รอตรวจ","keyword":"  launch\\nplan  ","targetPoints":"12"}\n```'
          }
        }]
      })
    };
  };

  try {
    const plan = await requestDataPlan({
      providerUrl: 'https://provider.example.test/chat',
      apiKey: 'secret',
      model: 'test-model',
      question: 'x'.repeat(1200),
      currentDate: '2026-08-20',
      messages: [{ role: 'user', content: 'a'.repeat(600) }],
      timeoutMs: 1000,
    });

    assert.equal(request.url, 'https://provider.example.test/chat');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer secret');
    const body = JSON.parse(request.options.body);
    assert.equal(body.model, 'test-model');
    assert.match(body.messages[0].content, /read-only/);
    assert.equal(plan.dataset, 'briefings');
    assert.deepEqual(plan.people, ['แพด']);
    assert.equal(plan.keyword, 'launch plan');
    assert.equal(plan.targetPoints, 12);
  } finally {
    global.fetch = originalFetch;
  }
});

test('data planner fails closed for provider and response errors', async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: false });
    assert.equal(await requestDataPlan({ providerUrl: 'https://provider.example.test', apiKey: 'secret', question: 'งาน' }), null);

    global.fetch = async () => { throw new Error('offline'); };
    assert.equal(await requestDataPlan({ providerUrl: 'https://provider.example.test', apiKey: 'secret', question: 'งาน' }), null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('data planner aborts a slow provider request within its bounded timeout', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  try {
    assert.equal(await requestDataPlan({
      providerUrl: 'https://provider.example.test',
      apiKey: 'secret',
      question: 'งาน',
      timeoutMs: 1,
    }), null);
  } finally {
    global.fetch = originalFetch;
  }
});
