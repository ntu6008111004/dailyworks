import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPages } from '../src/utils/fetchAllPages.js';

const table = (count) => Array.from({ length: count }, (_, i) => ({ ID: i }));

const serve = (rows, log) => async (from, to) => {
  log.push([from, to]);
  return rows.slice(from, to + 1);
};

test('a short first page is the whole list, with no extra requests', async () => {
  const log = [];
  assert.deepEqual(await fetchAllPages(serve(table(7), log), { pageSize: 10 }), table(7));
  assert.deepEqual(log, [[0, 9]]);
});

test('every row comes back once and in order across concurrent pages', async () => {
  const log = [];
  const rows = await fetchAllPages(serve(table(66), log), { pageSize: 10, concurrency: 3 });
  assert.deepEqual(rows, table(66));
  // 1 page first, then batches of 3: rounds of [10,20,30] and [40,50,60]
  assert.equal(log.length, 7);
});

test('an exact multiple of the page size ends on the empty page', async () => {
  const log = [];
  assert.deepEqual(await fetchAllPages(serve(table(20), log), { pageSize: 10, concurrency: 2 }), table(20));
  assert.deepEqual(log, [[0, 9], [10, 19], [20, 29]]);
});

test('pages missing from the answer count as empty, errors are passed on', async () => {
  assert.deepEqual(await fetchAllPages(async () => null), []);
  let calls = 0;
  const flaky = async (from) => {
    calls += 1;
    if (from === 0) return table(2);
    return from === 2 ? undefined : table(2);
  };
  // The empty page ends the list; a later page in the same batch is ignored.
  assert.equal((await fetchAllPages(flaky, { pageSize: 2, concurrency: 2 })).length, 2);
  assert.equal(calls, 3);
  await assert.rejects(fetchAllPages(async (from) => { if (from > 0) throw new Error('page failed'); return table(2); }, { pageSize: 2 }), { message: 'page failed' });
});

test('defaults match the PostgREST page size', async () => {
  const log = [];
  await fetchAllPages(serve(table(1500), log));
  assert.deepEqual(log[0], [0, 999]);
  assert.equal(log.length, 4);
});
