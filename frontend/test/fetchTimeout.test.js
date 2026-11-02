import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READ_TIMEOUT_MS, TIMEOUT_MESSAGE, WRITE_TIMEOUT_MS,
  createTimeoutError, createTimeoutFetch, requestTimeoutFor, withTimeout,
} from '../src/utils/fetchTimeout.js';

const API = 'https://api.example.test';

// A fetch that never answers until its signal aborts, like a request sent down
// a connection that died while the phone was asleep.
const hangingFetch = (calls) => (input, init) => {
  calls.push({ input, init });
  return new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
};

const shortLimits = () => 20;

test('reads and writes get limits, uploads to storage do not', () => {
  assert.equal(requestTimeoutFor(`${API}/rest/v1/Tasks?select=*`, 'get'), READ_TIMEOUT_MS);
  assert.equal(requestTimeoutFor(`${API}/rest/v1/Tasks`, 'HEAD'), READ_TIMEOUT_MS);
  assert.equal(requestTimeoutFor(`${API}/rest/v1/Tasks`, 'POST'), WRITE_TIMEOUT_MS);
  assert.equal(requestTimeoutFor(`${API}/rest/v1/rpc/claim_briefing`, 'POST'), WRITE_TIMEOUT_MS);
  assert.equal(requestTimeoutFor(`${API}/storage/v1/object/worklog-files/a.pdf`, 'POST'), 0);
  assert.equal(requestTimeoutFor(`${API}/storage/v1/object/worklog-files/a.pdf`, 'PUT'), 0);
  assert.equal(requestTimeoutFor(`${API}/storage/v1/object/public/worklog-files/a.pdf`, 'GET'), READ_TIMEOUT_MS);
  assert.equal(requestTimeoutFor(`${API}/rest/v1/Tasks`, undefined), READ_TIMEOUT_MS);
});

test('a hanging read is retried once, then fails with a readable message', async () => {
  const calls = [];
  const timeoutFetch = createTimeoutFetch(hangingFetch(calls), { timeoutFor: shortLimits });
  await assert.rejects(timeoutFetch(`${API}/rest/v1/Tasks`), (error) => {
    assert.equal(error.name, 'TimeoutError');
    assert.equal(error.message, TIMEOUT_MESSAGE);
    return true;
  });
  assert.equal(calls.length, 2);
});

test('a read that hangs once and then answers succeeds on the retry', async () => {
  let attempts = 0;
  const flaky = (input, init) => {
    attempts += 1;
    if (attempts === 1) return hangingFetch([])(input, init);
    return Promise.resolve(new Response('[]', { status: 200 }));
  };
  const timeoutFetch = createTimeoutFetch(flaky, { timeoutFor: shortLimits });
  const response = await timeoutFetch(new Request(`${API}/rest/v1/Tasks`));
  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
});

test('writes are never repeated, so nothing is saved twice', async () => {
  const calls = [];
  const timeoutFetch = createTimeoutFetch(hangingFetch(calls), { timeoutFor: shortLimits });
  await assert.rejects(timeoutFetch(`${API}/rest/v1/Tasks`, { method: 'POST', body: '{}' }), { name: 'TimeoutError' });
  assert.equal(calls.length, 1);
});

test('uploads pass straight through with the caller options untouched', async () => {
  const seen = [];
  const base = (input, init) => { seen.push(init); return Promise.resolve(new Response('ok')); };
  const init = { method: 'POST', body: 'file' };
  const response = await createTimeoutFetch(base)(`${API}/storage/v1/object/worklog-files/a.pdf`, init);
  assert.equal(await response.text(), 'ok');
  assert.equal(seen[0], init);
});

test('answers in time are returned as they are', async () => {
  const base = () => Promise.resolve(new Response('{"ok":true}', { status: 201 }));
  const response = await createTimeoutFetch(base)(`${API}/rest/v1/Tasks`, { method: 'PATCH' });
  assert.equal(response.status, 201);
});

test('network errors are not retried or renamed', async () => {
  let attempts = 0;
  const offline = () => { attempts += 1; return Promise.reject(new TypeError('Failed to fetch')); };
  await assert.rejects(createTimeoutFetch(offline)(`${API}/rest/v1/Tasks`), { name: 'TypeError' });
  assert.equal(attempts, 1);
});

test('cancelling from the caller stops the request without a retry', async () => {
  const calls = [];
  const caller = new AbortController();
  const timeoutFetch = createTimeoutFetch(hangingFetch(calls), { timeoutFor: () => 5000 });
  const pending = timeoutFetch(`${API}/rest/v1/Tasks`, { signal: caller.signal });
  caller.abort(new Error('user left'));
  await assert.rejects(pending, { message: 'aborted' });
  assert.equal(calls.length, 1);
});

test('a request cancelled before it starts is not sent', async () => {
  const calls = [];
  const caller = new AbortController();
  caller.abort(new Error('already gone'));
  await assert.rejects(
    createTimeoutFetch(hangingFetch(calls))(`${API}/rest/v1/Tasks`, { signal: caller.signal }),
    { message: 'already gone' },
  );
  const bare = new AbortController();
  bare.abort();
  Object.defineProperty(bare.signal, 'reason', { value: undefined });
  await assert.rejects(createTimeoutFetch(hangingFetch(calls))(`${API}/rest/v1/Tasks`, { signal: bare.signal }), { name: 'TimeoutError' });
  assert.equal(calls.length, 0);
});

test('withTimeout gives up on a promise that never settles, and passes results through', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10), { name: 'TimeoutError' });
  assert.equal(await withTimeout(Promise.resolve('page'), 1000), 'page');
  await assert.rejects(withTimeout(Promise.reject(new Error('404')), 1000), { message: '404' });
  assert.equal(createTimeoutError().message, TIMEOUT_MESSAGE);
});

// Headers arrive, then the body stops halfway: the case that used to leave the
// task list spinning until the page was refreshed.
const stallingBodyFetch = (calls, { stallFirst = Infinity } = {}) => (input, init) => {
  calls.push(input);
  const stall = calls.length <= stallFirst;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('[{"ID":1}'));
      if (!stall) {
        controller.enqueue(new TextEncoder().encode(',{"ID":2}]'));
        controller.close();
        return;
      }
      init.signal.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true });
    },
  });
  return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Range': '0-1/2' } }));
};

test('a read whose body stops arriving is cut off and retried', async () => {
  const calls = [];
  const timeoutFetch = createTimeoutFetch(stallingBodyFetch(calls, { stallFirst: 1 }), { timeoutFor: shortLimits });
  const response = await timeoutFetch(`${API}/rest/v1/TasksSummary`);
  assert.deepEqual(await response.json(), [{ ID: 1 }, { ID: 2 }]);
  assert.equal(response.headers.get('content-range'), '0-1/2');
  assert.equal(calls.length, 2);
});

test('a body that never finishes ends in a timeout instead of hanging forever', async () => {
  const calls = [];
  const timeoutFetch = createTimeoutFetch(stallingBodyFetch(calls), { timeoutFor: shortLimits });
  await assert.rejects(timeoutFetch(`${API}/rest/v1/TasksSummary`), { name: 'TimeoutError' });
  assert.equal(calls.length, 2);
});

test('a slow body that keeps moving is not cut off', async () => {
  const slow = () => {
    let sent = 0;
    const body = new ReadableStream({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 15));
        sent += 1;
        if (sent > 4) controller.close();
        else controller.enqueue(new TextEncoder().encode('x'));
      },
    });
    return Promise.resolve(new Response(body));
  };
  // Each chunk takes 15 ms, the whole body 75 ms: longer than the 20 ms limit.
  const response = await createTimeoutFetch(slow, { timeoutFor: shortLimits })(`${API}/rest/v1/Tasks`);
  assert.equal(await response.text(), 'xxxx');
});
