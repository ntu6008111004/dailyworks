const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migration', '20261006_briefing_claim.sql'),
  'utf8',
);

test('claiming locks the row and only takes a brief that still has nobody', () => {
  assert.match(migration, /FROM "Briefings" WHERE "ID" = p_briefing_id FOR UPDATE/);
  assert.match(migration, /RAISE EXCEPTION 'This briefing already has an assignee'/);
  assert.match(migration, /RAISE EXCEPTION 'Completed or cancelled work cannot be claimed'/);
  assert.match(migration, /SET "Assignees" = jsonb_build_array\(p_user_id\)/);
});

test('every claim is recorded in the review history', () => {
  assert.match(migration, /'MEMBER_SCORED', 'CLAIMED'/);
  assert.match(migration, /'CLAIMED', 'รับงานที่ยังไม่มีผู้รับผิดชอบ'/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.claim_briefing\(TEXT, TEXT\)/);
});

const dueDateFix = fs.readFileSync(
  path.join(__dirname, '..', 'migration', '20261007_briefing_claim_due_date.sql'),
  'utf8',
);

test('claiming an overdue brief moves its due date to the claim day', () => {
  assert.match(dueDateFix, /v_today DATE := \(timezone\('Asia\/Bangkok', now\(\)\)\)::DATE/);
  assert.match(dueDateFix, /IF v_due IS NOT NULL AND v_due < v_today THEN/);
  assert.match(dueDateFix, /"DueDate" = CASE WHEN v_due IS NOT NULL THEN to_char\(v_today, 'YYYY-MM-DD'\) ELSE "DueDate" END/);
  assert.match(dueDateFix, /"PreviousDueDate", "NewDueDate"/);
  // Every guard of the first version is kept.
  for (const rule of [/FOR UPDATE/, /'This briefing already has an assignee'/, /'Completed or cancelled work cannot be claimed'/]) {
    assert.match(dueDateFix, rule);
  }
});
