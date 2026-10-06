const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migration', '20261006_briefing_member_scores.sql'),
  'utf8',
);
const previous = fs.readFileSync(
  path.join(__dirname, '..', 'migration', '20260820_briefing_monthly_penalties.sql'),
  'utf8',
);

test('member scores are read-only to clients and written only by the reviewer RPC', () => {
  assert.match(migration, /PRIMARY KEY \("BriefingID", "UserID"\)/);
  assert.match(migration, /GRANT SELECT ON TABLE "BriefingMemberScores" TO anon, authenticated/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE "BriefingMemberScores" FROM anon, authenticated/);
  assert.match(migration, /Only the department head or an admin may score this briefing/);
  assert.match(migration, /This briefing was closed with a single shared score/);
});

test('the member award uses the same deduction and bonus rules as the shared score', () => {
  assert.match(migration, /WHEN 'good' THEN ROUND\(r\.remaining \* 0\.5, 2\)/);
  assert.match(migration, /WHEN 'excellent' THEN r\.remaining/);
  assert.match(migration, /WHEN 'viral' THEN 30/);
});

test('approval requires every assignee scored, and the rest of review_briefing is unchanged', () => {
  assert.match(migration, /RAISE EXCEPTION 'Score every assignee before approval'/);
  // Every lateness, error and severe-error rule is carried over verbatim.
  for (const rule of [
    /v_correction_deduction INTEGER := 1/,
    /v_error_deduction INTEGER := 5/,
    /v_severe_deduction INTEGER := 50/,
    /SELECT DISTINCT unnest\(p_target_user_ids\)/,
    /PERFORM public\.sync_briefing_late_penalty\(/,
    /'SCORE_ADJUSTED'/,
  ]) {
    assert.match(previous, rule);
    assert.match(migration, rule);
  }
});
