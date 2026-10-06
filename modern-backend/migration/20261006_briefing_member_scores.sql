-- Per-person briefing scores, set only by the reviewer.
-- Run after 20260829_review_comment_images.sql.
--
-- Until now the person who briefed the work picked one score (1/4/8) and every
-- participant was paid that same number.  From here the department head (or an
-- admin) who reviews the work scores each person separately: a rate-card base
-- plus a bonus level per person.  The briefer no longer has a score field.
--
-- Award per person = max(0, Points - Briefings.DeductedPoints) + level bonus.
-- "สั่งแก้ไข" keeps deducting from the whole task, now from each person's base.
--
-- Briefings closed before this migration have no rows here and keep their old
-- single shared score, so past months do not change.  Rows are written only by
-- save_briefing_member_scores(); approval requires every assignee to be scored.

BEGIN;

CREATE TABLE IF NOT EXISTS "BriefingMemberScores" (
  "BriefingID" TEXT NOT NULL REFERENCES "Briefings"("ID") ON DELETE CASCADE,
  "UserID" TEXT NOT NULL REFERENCES "Users"("ID") ON DELETE CASCADE,
  "Points" NUMERIC(12,2) NOT NULL CHECK ("Points" >= 0),
  "BonusLevel" TEXT NOT NULL DEFAULT 'standard'
    CHECK ("BonusLevel" IN ('standard', 'good', 'excellent', 'viral')),
  "ScoredBy" TEXT REFERENCES "Users"("ID") ON DELETE SET NULL,
  "ScoredAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY ("BriefingID", "UserID")
);

CREATE INDEX IF NOT EXISTS idx_briefing_member_scores_user
  ON "BriefingMemberScores"("UserID");

-- Everyone may read scores (dashboard, team overview); nobody writes directly.
GRANT SELECT ON TABLE "BriefingMemberScores" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE "BriefingMemberScores" FROM anon, authenticated;

-- The daily summary on the review page reads every SUBMITTED event of a day.
CREATE INDEX IF NOT EXISTS idx_briefing_review_history_action_date
  ON "BriefingReviewHistory"("Action", "CreatedAt" DESC);

ALTER TABLE "BriefingReviewHistory"
  ALTER COLUMN "PreviousAwardedPoints" TYPE NUMERIC(12,2),
  ALTER COLUMN "NewAwardedPoints" TYPE NUMERIC(12,2),
  ALTER COLUMN "PointsDelta" TYPE NUMERIC(12,2);

ALTER TABLE "BriefingReviewHistory"
  DROP CONSTRAINT IF EXISTS "BriefingReviewHistory_Action_check";
ALTER TABLE "BriefingReviewHistory"
  ADD CONSTRAINT "BriefingReviewHistory_Action_check"
  CHECK ("Action" IN (
    'SUBMITTED', 'NEEDS_REVISION', 'REJECTED', 'SEVERE_ERROR', 'APPROVED',
    'BONUS_UPDATED', 'SCORE_ADJUSTED', 'DEADLINE_EXTENDED', 'EXTRA_WORK',
    'MEMBER_SCORED'
  ));

-- Same arithmetic as getMemberAwardDetails() in frontend/src/utils/briefingScore.js.
CREATE OR REPLACE FUNCTION public.briefing_member_award(
  p_points NUMERIC,
  p_bonus_level TEXT,
  p_deducted NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND(r.remaining + CASE COALESCE(p_bonus_level, 'standard')
    WHEN 'good' THEN ROUND(r.remaining * 0.5, 2)
    WHEN 'excellent' THEN r.remaining
    WHEN 'viral' THEN 30
    ELSE 0 END, 2)
  FROM (SELECT GREATEST(0, COALESCE(p_points, 0) - GREATEST(0, COALESCE(p_deducted, 0))) AS remaining) r;
$$;

-- p_scores: [{"userId": "...", "points": 4, "bonusLevel": "good"}, ...]
-- One element saves one row ("บันทึก"), many save the whole panel ("บันทึกทั้งหมด").
CREATE OR REPLACE FUNCTION public.save_briefing_member_scores(
  p_briefing_id TEXT,
  p_reviewer_id TEXT,
  p_scores JSONB
)
RETURNS SETOF "BriefingMemberScores"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_briefing "Briefings"%ROWTYPE;
  v_reviewer "Users"%ROWTYPE;
  v_creator_department TEXT;
  v_item JSONB;
  v_user_id TEXT;
  v_points NUMERIC(12,2);
  v_level TEXT;
  v_previous "BriefingMemberScores"%ROWTYPE;
  v_previous_award NUMERIC(12,2);
  v_new_award NUMERIC(12,2);
  v_now TIMESTAMP WITH TIME ZONE := timezone('utc'::text, now());
BEGIN
  SELECT * INTO v_briefing FROM "Briefings" WHERE "ID" = p_briefing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Briefing not found'; END IF;
  SELECT * INTO v_reviewer FROM "Users" WHERE "ID" = p_reviewer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reviewer not found'; END IF;
  SELECT "Department" INTO v_creator_department FROM "Users" WHERE "ID" = v_briefing."CreatorID";
  IF v_reviewer."Role" <> 'Admin'
    AND (v_reviewer."Role" <> 'Head' OR v_reviewer."Department" IS DISTINCT FROM v_creator_department) THEN
    RAISE EXCEPTION 'Only the department head or an admin may score this briefing';
  END IF;
  IF v_briefing."Status" = 'ยกเลิกงาน' THEN RAISE EXCEPTION 'Cancelled work cannot be scored'; END IF;
  -- Work closed with the old shared score stays on that score; switching it to
  -- per-person rows would silently zero everyone the reviewer did not re-score.
  IF v_briefing."Status" = 'เสร็จสิ้น' AND NOT EXISTS (
    SELECT 1 FROM "BriefingMemberScores" WHERE "BriefingID" = p_briefing_id
  ) THEN
    RAISE EXCEPTION 'This briefing was closed with a single shared score';
  END IF;
  IF jsonb_typeof(p_scores) <> 'array' OR jsonb_array_length(p_scores) = 0 THEN
    RAISE EXCEPTION 'No member scores to save';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_scores)
  LOOP
    v_user_id := v_item ->> 'userId';
    v_points := ROUND((v_item ->> 'points')::NUMERIC, 2);
    v_level := COALESCE(NULLIF(v_item ->> 'bonusLevel', ''), 'standard');
    IF v_user_id IS NULL OR v_user_id = '' THEN RAISE EXCEPTION 'A member score is missing its user'; END IF;
    IF v_points IS NULL OR v_points < 0 THEN RAISE EXCEPTION 'Member points must be zero or greater'; END IF;
    IF v_level NOT IN ('standard', 'good', 'excellent', 'viral') THEN RAISE EXCEPTION 'Unsupported bonus level'; END IF;
    IF v_user_id <> v_briefing."CreatorID" AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_briefing."Assignees", '[]'::jsonb)) AS assignee("UserID")
      WHERE assignee."UserID" = v_user_id
    ) THEN RAISE EXCEPTION 'A selected user is not a participant in this briefing'; END IF;

    SELECT * INTO v_previous FROM "BriefingMemberScores"
    WHERE "BriefingID" = p_briefing_id AND "UserID" = v_user_id;
    v_previous_award := CASE WHEN FOUND
      THEN public.briefing_member_award(v_previous."Points", v_previous."BonusLevel", v_briefing."DeductedPoints")
      ELSE NULL END;
    v_new_award := public.briefing_member_award(v_points, v_level, v_briefing."DeductedPoints");

    INSERT INTO "BriefingMemberScores" ("BriefingID", "UserID", "Points", "BonusLevel", "ScoredBy", "ScoredAt")
    VALUES (p_briefing_id, v_user_id, v_points, v_level, p_reviewer_id, v_now)
    ON CONFLICT ("BriefingID", "UserID") DO UPDATE
    SET "Points" = EXCLUDED."Points", "BonusLevel" = EXCLUDED."BonusLevel",
        "ScoredBy" = EXCLUDED."ScoredBy", "ScoredAt" = EXCLUDED."ScoredAt";

    IF v_previous_award IS DISTINCT FROM v_new_award THEN
      INSERT INTO "BriefingReviewHistory" (
        "BriefingID", "ReviewerID", "Action", "Comment", "TargetUserIDs", "BonusLevel",
        "PreviousAwardedPoints", "NewAwardedPoints", "PointsDelta"
      ) VALUES (
        p_briefing_id, p_reviewer_id, 'MEMBER_SCORED', '', jsonb_build_array(v_user_id), v_level,
        v_previous_award, v_new_award, v_new_award - COALESCE(v_previous_award, 0)
      );
    END IF;
  END LOOP;

  UPDATE "Briefings" SET "UpdatedAt" = v_now, "LastUpdatedBy" = p_reviewer_id WHERE "ID" = p_briefing_id;
  RETURN QUERY SELECT * FROM "BriefingMemberScores" WHERE "BriefingID" = p_briefing_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.briefing_member_award(NUMERIC, TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_briefing_member_scores(TEXT, TEXT, JSONB) TO anon, authenticated;

-- review_briefing(): same body as 20260820_briefing_monthly_penalties.sql with
-- three changes, each marked "member scores":
--   1. สั่งแก้ไข deducts the full department rate when the brief carries no
--      shared score (new briefings have Points = 0, the old cap would make it 0).
--   2. สั่งเพิ่มงาน no longer needs points; the head re-scores each person.
--   3. อนุมัติ requires every assignee to have a member score.
CREATE OR REPLACE FUNCTION public.review_briefing(
  p_briefing_id TEXT,
  p_reviewer_id TEXT,
  p_action TEXT,
  p_comment TEXT DEFAULT '',
  p_bonus_level TEXT DEFAULT NULL,
  p_target_points NUMERIC DEFAULT NULL,
  p_target_user_ids TEXT[] DEFAULT NULL,
  p_extra_points INTEGER DEFAULT NULL,
  p_extension_days INTEGER DEFAULT NULL
)
RETURNS "Briefings"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_briefing "Briefings"%ROWTYPE;
  v_reviewer "Users"%ROWTYPE;
  v_creator_department TEXT;
  v_correction_deduction INTEGER := 1;
  v_error_deduction INTEGER := 5;
  v_severe_deduction INTEGER := 50;
  v_actual_deduction INTEGER := 0;
  v_remaining_points NUMERIC(12,2) := 0;
  v_bonus_level TEXT;
  v_bonus_points NUMERIC(12,2) := 0;
  v_base_award NUMERIC(12,2) := 0;
  v_previous_award NUMERIC(12,2) := 0;
  v_new_award NUMERIC(12,2) := 0;
  v_target_user_id TEXT;
  v_previous_due DATE;
  v_new_due DATE;
  v_submit_date DATE;
  v_now TIMESTAMP WITH TIME ZONE := timezone('utc'::text, now());
BEGIN
  SELECT * INTO v_briefing FROM "Briefings" WHERE "ID" = p_briefing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Briefing not found'; END IF;
  SELECT * INTO v_reviewer FROM "Users" WHERE "ID" = p_reviewer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reviewer not found'; END IF;
  SELECT "Department" INTO v_creator_department FROM "Users" WHERE "ID" = v_briefing."CreatorID";
  IF v_reviewer."Role" <> 'Admin'
    AND (v_reviewer."Role" <> 'Head' OR v_reviewer."Department" IS DISTINCT FROM v_creator_department) THEN
    RAISE EXCEPTION 'Only the department head or an admin may review this briefing';
  END IF;

  IF v_briefing."Status" = 'เสร็จสิ้น'
    AND (p_action NOT IN ('bonus', 'score_adjustment') OR v_briefing."ReviewedAt" IS NULL) THEN
    RAISE EXCEPTION 'Completed legacy briefings cannot be changed by the new review workflow';
  END IF;

  IF p_action = 'score_adjustment' THEN
    IF v_briefing."Status" <> 'เสร็จสิ้น' OR v_briefing."ReviewedAt" IS NULL THEN
      RAISE EXCEPTION 'Score adjustments are available only after review approval';
    END IF;
    IF p_target_points IS NULL OR p_target_points < 0 THEN RAISE EXCEPTION 'Target points must be zero or greater'; END IF;
    v_base_award := GREATEST(0, COALESCE(v_briefing."FinalPoints", COALESCE(v_briefing."Points", 0) - COALESCE(v_briefing."DeductedPoints", 0)))
      + GREATEST(0, COALESCE(v_briefing."BonusPoints", 0));
    v_previous_award := GREATEST(0, v_base_award + COALESCE(v_briefing."ScoreAdjustment", 0));
    v_new_award := GREATEST(0, ROUND(p_target_points, 2));
    UPDATE "Briefings"
    SET "ScoreAdjustment" = v_new_award - v_base_award, "UpdatedAt" = v_now, "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id RETURNING * INTO v_briefing;
    INSERT INTO "BriefingReviewHistory" (
      "BriefingID", "ReviewerID", "Action", "Comment", "PreviousAwardedPoints", "NewAwardedPoints", "PointsDelta"
    ) VALUES (
      p_briefing_id, p_reviewer_id, 'SCORE_ADJUSTED', COALESCE(p_comment, ''),
      v_previous_award, v_new_award, v_new_award - v_previous_award
    );
    RETURN v_briefing;
  END IF;

  SELECT "CorrectionDeduction", "RejectedDeduction", "SevereDeduction"
  INTO v_correction_deduction, v_error_deduction, v_severe_deduction
  FROM "BriefingReviewSettings" WHERE "Department" = COALESCE(v_creator_department, '');
  v_correction_deduction := COALESCE(v_correction_deduction, 1);
  v_error_deduction := COALESCE(v_error_deduction, 5);
  v_severe_deduction := COALESCE(v_severe_deduction, 50);
  v_remaining_points := GREATEST(0, COALESCE(v_briefing."Points", 0) - COALESCE(v_briefing."DeductedPoints", 0));

  IF p_action IN ('bonus', 'approved') THEN
    v_bonus_level := COALESCE(NULLIF(p_bonus_level, ''), v_briefing."BonusLevel", 'standard');
    IF v_bonus_level NOT IN ('standard', 'good', 'excellent', 'viral') THEN RAISE EXCEPTION 'Unsupported bonus level'; END IF;
    v_bonus_points := CASE v_bonus_level
      WHEN 'good' THEN ROUND(v_remaining_points * 0.5, 2)
      WHEN 'excellent' THEN v_remaining_points
      WHEN 'viral' THEN 30 ELSE 0 END;
  END IF;

  IF p_action = 'bonus' THEN
    UPDATE "Briefings"
    SET "BonusLevel" = v_bonus_level, "BonusPoints" = v_bonus_points,
        "UpdatedAt" = v_now, "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id RETURNING * INTO v_briefing;
    INSERT INTO "BriefingReviewHistory" ("BriefingID", "ReviewerID", "Action", "Comment", "BonusLevel", "BonusPoints")
    VALUES (p_briefing_id, p_reviewer_id, 'BONUS_UPDATED', COALESCE(p_comment, ''), v_bonus_level, v_bonus_points);
    RETURN v_briefing;
  END IF;

  IF p_action = 'extend_deadline' THEN
    IF p_extension_days IS NULL OR p_extension_days < 1 THEN RAISE EXCEPTION 'Extension days must be at least 1'; END IF;
    IF btrim(COALESCE(p_comment, '')) = '' THEN RAISE EXCEPTION 'A reason is required when extending a deadline'; END IF;
    BEGIN v_previous_due := NULLIF(v_briefing."DueDate", '')::DATE;
    EXCEPTION WHEN invalid_datetime_format THEN RAISE EXCEPTION 'The current due date is invalid'; END;
    IF v_previous_due IS NULL THEN RAISE EXCEPTION 'A due date is required before it can be extended'; END IF;
    v_new_due := v_previous_due + p_extension_days;
    UPDATE "Briefings"
    SET "DueDate" = to_char(v_new_due, 'YYYY-MM-DD'),
        "TotalExtendedDays" = COALESCE("TotalExtendedDays", 0) + p_extension_days,
        "UpdatedAt" = v_now, "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id RETURNING * INTO v_briefing;
    FOR v_target_user_id IN
      SELECT assignee."UserID" FROM jsonb_array_elements_text(COALESCE(v_briefing."Assignees", '[]'::jsonb)) AS assignee("UserID")
    LOOP
      SELECT COALESCE((timezone('Asia/Bangkok', response."SubmittedAt"))::DATE, (timezone('Asia/Bangkok', v_now))::DATE)
      INTO v_submit_date FROM "BriefingResponses" response
      WHERE response."BriefingID" = p_briefing_id AND response."UserID" = v_target_user_id;
      v_submit_date := COALESCE(v_submit_date, (timezone('Asia/Bangkok', v_now))::DATE);
      PERFORM public.sync_briefing_late_penalty(
        p_briefing_id, v_target_user_id, v_submit_date, p_reviewer_id, 'คืนหรือปรับคะแนนหลังขยายกำหนดส่ง: ' || p_comment
      );
    END LOOP;
    INSERT INTO "BriefingReviewHistory" (
      "BriefingID", "ReviewerID", "Action", "Comment", "PreviousDueDate", "NewDueDate", "ExtensionDays"
    ) VALUES (
      p_briefing_id, p_reviewer_id, 'DEADLINE_EXTENDED', p_comment,
      to_char(v_previous_due, 'YYYY-MM-DD'), to_char(v_new_due, 'YYYY-MM-DD'), p_extension_days
    );
    RETURN v_briefing;
  END IF;

  IF p_action = 'extra_work' THEN
    -- member scores: points are optional; the head re-scores each person instead.
    IF p_extra_points IS NOT NULL AND p_extra_points < 0 THEN RAISE EXCEPTION 'Additional work points cannot be negative'; END IF;
    IF btrim(COALESCE(p_comment, '')) = '' THEN RAISE EXCEPTION 'Additional work details are required'; END IF;
    UPDATE "Briefings"
    SET "Points" = COALESCE("Points", 0) + COALESCE(p_extra_points, 0), "Status" = 'สั่งเพิ่มงาน',
        "UpdatedAt" = v_now, "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id RETURNING * INTO v_briefing;
    UPDATE "BriefingResponses" SET "Status" = 'สั่งเพิ่มงาน', "SubmittedAt" = NULL, "UpdatedAt" = v_now
    WHERE "BriefingID" = p_briefing_id;
    INSERT INTO "BriefingReviewHistory" ("BriefingID", "ReviewerID", "Action", "Comment", "ExtraPoints")
    VALUES (p_briefing_id, p_reviewer_id, 'EXTRA_WORK', p_comment, NULLIF(COALESCE(p_extra_points, 0), 0));
    RETURN v_briefing;
  END IF;

  IF p_action NOT IN ('needs_revision', 'rejected', 'severe_error', 'approved') THEN RAISE EXCEPTION 'Unsupported review action'; END IF;
  IF p_action IN ('needs_revision', 'rejected', 'severe_error') AND btrim(COALESCE(p_comment, '')) = '' THEN
    RAISE EXCEPTION 'A comment is required for this review action';
  END IF;

  IF p_action IN ('rejected', 'severe_error') THEN
    IF COALESCE(cardinality(p_target_user_ids), 0) = 0 THEN RAISE EXCEPTION 'Select at least one responsible participant'; END IF;
    FOR v_target_user_id IN SELECT DISTINCT unnest(p_target_user_ids)
    LOOP
      IF v_target_user_id <> v_briefing."CreatorID" AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_briefing."Assignees", '[]'::jsonb)) AS assignee("UserID")
        WHERE assignee."UserID" = v_target_user_id
      ) THEN RAISE EXCEPTION 'A selected user is not a participant in this briefing'; END IF;
      INSERT INTO "BriefingPointLedger" (
        "BriefingID", "UserID", "EntryType", "Points", "ReviewerID", "Comment"
      ) VALUES (
        p_briefing_id, v_target_user_id,
        CASE WHEN p_action = 'severe_error' THEN 'SEVERE_ERROR_PENALTY' ELSE 'ERROR_PENALTY' END,
        CASE WHEN p_action = 'severe_error' THEN v_severe_deduction ELSE v_error_deduction END,
        p_reviewer_id, p_comment
      );
    END LOOP;
  END IF;

  IF p_action = 'approved' THEN
    -- member scores: every assignee must be scored by the reviewer first.
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_briefing."Assignees", '[]'::jsonb)) AS assignee("UserID")
      WHERE NOT EXISTS (
        SELECT 1 FROM "BriefingMemberScores" score
        WHERE score."BriefingID" = p_briefing_id AND score."UserID" = assignee."UserID"
      )
    ) THEN
      RAISE EXCEPTION 'Score every assignee before approval';
    END IF;
    UPDATE "Briefings"
    SET "Status" = 'เสร็จสิ้น', "CompletedAt" = v_now, "ReviewedAt" = v_now,
        "ReviewedBy" = p_reviewer_id, "FinalPoints" = v_remaining_points,
        "BonusLevel" = v_bonus_level, "BonusPoints" = v_bonus_points,
        "ScoreAdjustment" = 0, "UpdatedAt" = v_now, "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id RETURNING * INTO v_briefing;
    UPDATE "BriefingResponses" SET "Status" = 'เสร็จสิ้น', "UpdatedAt" = v_now WHERE "BriefingID" = p_briefing_id;
    INSERT INTO "BriefingReviewHistory" ("BriefingID", "ReviewerID", "Action", "Comment", "BonusLevel", "BonusPoints")
    VALUES (p_briefing_id, p_reviewer_id, 'APPROVED', COALESCE(p_comment, ''), v_bonus_level, v_bonus_points);
  ELSIF p_action = 'needs_revision' THEN
    -- member scores: without a shared score there is nothing to cap against.
    v_actual_deduction := CASE WHEN COALESCE(v_briefing."Points", 0) > 0
      THEN LEAST(v_correction_deduction, v_remaining_points::INTEGER)
      ELSE v_correction_deduction END;
    UPDATE "Briefings"
    SET "Status" = 'สั่งแก้ไข', "DeductedPoints" = COALESCE("DeductedPoints", 0) + v_actual_deduction,
        "CorrectionCount" = COALESCE("CorrectionCount", 0) + 1,
        "ReviewedBy" = p_reviewer_id, "UpdatedAt" = v_now, "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id RETURNING * INTO v_briefing;
    UPDATE "BriefingResponses" SET "Status" = 'สั่งแก้ไข', "SubmittedAt" = NULL, "UpdatedAt" = v_now WHERE "BriefingID" = p_briefing_id;
    INSERT INTO "BriefingReviewHistory" ("BriefingID", "ReviewerID", "Action", "Comment", "PointsDeducted")
    VALUES (p_briefing_id, p_reviewer_id, 'NEEDS_REVISION', p_comment, v_actual_deduction);
  ELSE
    UPDATE "Briefings"
    SET "Status" = 'ส่งตรวจ',
        "RejectedCount" = COALESCE("RejectedCount", 0) + CASE WHEN p_action = 'rejected' THEN 1 ELSE 0 END,
        "SevereErrorCount" = COALESCE("SevereErrorCount", 0) + CASE WHEN p_action = 'severe_error' THEN 1 ELSE 0 END,
        "ReviewedBy" = p_reviewer_id, "UpdatedAt" = v_now, "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id RETURNING * INTO v_briefing;
    INSERT INTO "BriefingReviewHistory" ("BriefingID", "ReviewerID", "Action", "Comment", "TargetUserIDs")
    VALUES (
      p_briefing_id, p_reviewer_id,
      CASE WHEN p_action = 'severe_error' THEN 'SEVERE_ERROR' ELSE 'REJECTED' END,
      p_comment, to_jsonb(p_target_user_ids)
    );
  END IF;
  RETURN v_briefing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_briefing(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT[], INTEGER, INTEGER) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
