const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migration', '20260820_briefing_monthly_penalties.sql'),
  'utf8',
);

test('migration excludes existing briefings and enables lateness only for new rows', () => {
  const excludeOld = migration.indexOf('UPDATE "Briefings" SET "LatePenaltyEnabled" = false');
  const enableNew = migration.indexOf('ALTER COLUMN "LatePenaltyEnabled" SET DEFAULT true');

  assert.ok(excludeOld >= 0, 'existing briefings must be explicitly excluded');
  assert.ok(enableNew > excludeOld, 'the true default must be applied only after old rows are excluded');
  assert.match(migration, /WHERE b\."LatePenaltyEnabled" = true/);
});

test('lateness tiers stay at 1, 4 and a maximum of 8 points', () => {
  assert.match(migration, /WHEN v_late_days = 1 THEN 1/);
  assert.match(migration, /WHEN v_late_days BETWEEN 2 AND 3 THEN 4/);
  assert.match(migration, /ELSE 8\s+END/);
  assert.match(migration, /'LATE_REFUND'/);
});

test('review deductions keep the configurable 1, 5 and 50 defaults', () => {
  assert.match(migration, /v_correction_deduction INTEGER := 1/);
  assert.match(migration, /v_error_deduction INTEGER := 5/);
  assert.match(migration, /v_severe_deduction INTEGER := 50/);
  assert.match(migration, /p_action IN \('rejected', 'severe_error'\)/);
  assert.match(migration, /SELECT DISTINCT unnest\(p_target_user_ids\)/);
  assert.match(migration, /v_target_user_id <> v_briefing\."CreatorID" AND NOT EXISTS/);
});

test('task correction is separated from individual monthly penalties', () => {
  assert.match(migration, /"DeductedPoints" = COALESCE\("DeductedPoints", 0\) \+ v_actual_deduction/);
  assert.match(migration, /'ERROR_PENALTY'/);
  assert.match(migration, /'SEVERE_ERROR_PENALTY'/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_briefing_point_ledger/);
});

test('deadline extension refunds differences and additional work adds manual task points', () => {
  assert.match(migration, /IF p_extension_days IS NULL OR p_extension_days < 1/);
  assert.match(migration, /v_new_due := v_previous_due \+ p_extension_days/);
  assert.match(migration, /'คืนหรือปรับคะแนนหลังขยายกำหนดส่ง/);
  assert.match(migration, /IF p_extra_points IS NULL OR p_extra_points < 1/);
  assert.match(migration, /"Points" = COALESCE\("Points", 0\) \+ p_extra_points/);
});

test('assignee submission atomically saves evidence and sets both statuses to waiting review', () => {
  assert.match(migration, /CREATE FUNCTION public\.submit_briefing_response\([\s\S]*p_result_images JSONB/);
  assert.match(migration, /"ResultImages" = COALESCE\(p_result_images, '\[\]'::jsonb\)/);
  assert.match(migration, /"Status" = 'รอตรวจ', "SubmittedAt" = v_now/);
  assert.match(migration, /UPDATE "Briefings"\s+SET "Status" = 'รอตรวจ'/);
  assert.match(migration, /Only an assigned recipient may submit this work/);
});

test('no corrective review action can be sent without a written reason', () => {
  assert.match(migration, /p_action IN \('needs_revision', 'rejected', 'severe_error'\) AND btrim\(COALESCE\(p_comment, ''\)\) = ''/);
  assert.match(migration, /RAISE EXCEPTION 'A comment is required for this review action'/);
  assert.match(migration, /RAISE EXCEPTION 'A reason is required when extending a deadline'/);
  assert.match(migration, /RAISE EXCEPTION 'Additional work details are required'/);
});

test('an approved briefing pays the same score to the briefer and to every recipient', () => {
  // The score lives on the briefing, not on a per-person share: approval stores
  // one FinalPoints and every participant is credited that same amount.
  assert.match(migration, /"FinalPoints" = v_remaining_points/);
  assert.doesNotMatch(migration, /v_remaining_points\s*\/\s*(cardinality|jsonb_array_length)/);
  assert.match(migration, /"Points" = COALESCE\("Points", 0\) \+ p_extra_points/);
});

test('every user may read their own point ledger, heads their department, admins everyone', () => {
  const selfAccess = fs.readFileSync(
    path.join(__dirname, '..', 'migration', '20260820_briefing_ledger_self_access.sql'),
    'utf8',
  );
  assert.match(selfAccess, /v_viewer\."Role" = 'Admin'/);
  assert.match(selfAccess, /v_viewer\."Role" = 'Head' AND target\."Department" IS NOT DISTINCT FROM v_viewer\."Department"/);
  assert.match(selfAccess, /OR ledger\."UserID" = p_viewer_id/);
  assert.doesNotMatch(selfAccess, /Only a head or admin may view/);
  assert.match(selfAccess, /RAISE EXCEPTION 'Viewer not found'/);
});

test('a recipient may start work once, flipping the briefing to กำลังทำ for the briefer', () => {
  const startWork = fs.readFileSync(
    path.join(__dirname, '..', 'migration', '20260820_briefing_start_work.sql'),
    'utf8',
  );
  assert.match(startWork, /CREATE OR REPLACE FUNCTION public\.start_briefing_work\(/);
  assert.match(startWork, /RAISE EXCEPTION 'Only an assigned recipient may start this work'/);
  assert.match(startWork, /IN \('ส่งตรวจ', 'เสร็จสิ้น', 'ยกเลิกงาน'\)/);
  assert.match(startWork, /SET "Status" = 'กำลังทำ', "UpdatedAt" = v_now, "LastUpdatedBy" = p_user_id/);
  assert.match(startWork, /GRANT EXECUTE ON FUNCTION public\.start_briefing_work\(TEXT, TEXT\) TO anon, authenticated/);
});
