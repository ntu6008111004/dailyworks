-- Individual monthly penalties, automatic lateness, deadline extensions and
-- additional-work review actions. Run after 20260820_briefing_bonus_levels.sql.

BEGIN;

ALTER TABLE "Briefings"
  ADD COLUMN IF NOT EXISTS "LatePenaltyEnabled" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "SevereErrorCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "TotalExtendedDays" INTEGER NOT NULL DEFAULT 0;

-- Existing work is intentionally excluded. Only rows inserted after this
-- migration receive the TRUE default.
UPDATE "Briefings" SET "LatePenaltyEnabled" = false WHERE "LatePenaltyEnabled" IS NULL;
ALTER TABLE "Briefings"
  ALTER COLUMN "LatePenaltyEnabled" SET DEFAULT true,
  ALTER COLUMN "LatePenaltyEnabled" SET NOT NULL;

ALTER TABLE "BriefingResponses"
  ADD COLUMN IF NOT EXISTS "SubmittedAt" TIMESTAMP WITH TIME ZONE;

ALTER TABLE "BriefingReviewSettings"
  ALTER COLUMN "CorrectionDeduction" SET DEFAULT 1,
  ALTER COLUMN "RejectedDeduction" SET DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "SevereDeduction" INTEGER NOT NULL DEFAULT 50;

-- The old second field meant a generic error and originally defaulted to 1.
-- Move untouched defaults to the new standard of 5 without changing custom
-- values that a department already configured to another amount.
UPDATE "BriefingReviewSettings"
SET "RejectedDeduction" = 5
WHERE "RejectedDeduction" = 1;

CREATE TABLE IF NOT EXISTS "BriefingPointLedger" (
  "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "BriefingID" TEXT NOT NULL REFERENCES "Briefings"("ID") ON DELETE CASCADE,
  "UserID" TEXT NOT NULL REFERENCES "Users"("ID") ON DELETE CASCADE,
  "EntryType" TEXT NOT NULL CHECK ("EntryType" IN (
    'LATE_PENALTY', 'LATE_REFUND', 'ERROR_PENALTY', 'SEVERE_ERROR_PENALTY'
  )),
  "Points" NUMERIC(12,2) NOT NULL CHECK ("Points" >= 0),
  "LateDays" INTEGER,
  "ReviewerID" TEXT REFERENCES "Users"("ID") ON DELETE SET NULL,
  "Comment" TEXT NOT NULL DEFAULT '',
  "Metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_briefing_point_ledger_user_date
  ON "BriefingPointLedger"("UserID", "CreatedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_briefing_point_ledger_briefing_user
  ON "BriefingPointLedger"("BriefingID", "UserID", "EntryType");

REVOKE ALL ON TABLE "BriefingPointLedger" FROM anon, authenticated;

ALTER TABLE "BriefingReviewHistory"
  ADD COLUMN IF NOT EXISTS "TargetUserIDs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "ExtraPoints" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "PreviousDueDate" TEXT,
  ADD COLUMN IF NOT EXISTS "NewDueDate" TEXT,
  ADD COLUMN IF NOT EXISTS "ExtensionDays" INTEGER;

ALTER TABLE "BriefingReviewHistory"
  DROP CONSTRAINT IF EXISTS "BriefingReviewHistory_Action_check";
ALTER TABLE "BriefingReviewHistory"
  ADD CONSTRAINT "BriefingReviewHistory_Action_check"
  CHECK ("Action" IN (
    'SUBMITTED', 'NEEDS_REVISION', 'REJECTED', 'SEVERE_ERROR', 'APPROVED',
    'BONUS_UPDATED', 'SCORE_ADJUSTED', 'DEADLINE_EXTENDED', 'EXTRA_WORK'
  ));

CREATE OR REPLACE FUNCTION public.sync_briefing_late_penalty(
  p_briefing_id TEXT,
  p_user_id TEXT,
  p_as_of_date DATE,
  p_actor_id TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT ''
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_briefing "Briefings"%ROWTYPE;
  v_due_date DATE;
  v_late_days INTEGER := 0;
  v_target NUMERIC(12,2) := 0;
  v_current NUMERIC(12,2) := 0;
  v_delta NUMERIC(12,2) := 0;
BEGIN
  SELECT * INTO v_briefing FROM "Briefings" WHERE "ID" = p_briefing_id FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(v_briefing."LatePenaltyEnabled", false) THEN RETURN 0; END IF;
  IF NULLIF(btrim(COALESCE(v_briefing."DueDate", '')), '') IS NULL THEN RETURN 0; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_briefing."Assignees", '[]'::jsonb)) AS assignee("UserID")
    WHERE assignee."UserID" = p_user_id
  ) THEN RETURN 0; END IF;

  BEGIN
    v_due_date := v_briefing."DueDate"::DATE;
  EXCEPTION WHEN invalid_datetime_format THEN
    RETURN 0;
  END;

  v_late_days := GREATEST(0, COALESCE(p_as_of_date, (timezone('Asia/Bangkok', now()))::DATE) - v_due_date);
  v_target := CASE
    WHEN v_late_days <= 0 THEN 0
    WHEN v_late_days = 1 THEN 1
    WHEN v_late_days BETWEEN 2 AND 3 THEN 4
    ELSE 8
  END;

  SELECT COALESCE(SUM(CASE
    WHEN "EntryType" = 'LATE_PENALTY' THEN "Points"
    WHEN "EntryType" = 'LATE_REFUND' THEN -"Points"
    ELSE 0
  END), 0)
  INTO v_current
  FROM "BriefingPointLedger"
  WHERE "BriefingID" = p_briefing_id AND "UserID" = p_user_id
    AND "EntryType" IN ('LATE_PENALTY', 'LATE_REFUND');

  v_delta := ROUND(v_target - GREATEST(0, v_current), 2);
  IF v_delta > 0 THEN
    INSERT INTO "BriefingPointLedger" (
      "BriefingID", "UserID", "EntryType", "Points", "LateDays", "ReviewerID", "Comment", "Metadata"
    ) VALUES (
      p_briefing_id, p_user_id, 'LATE_PENALTY', v_delta, v_late_days, p_actor_id,
      COALESCE(NULLIF(p_reason, ''), 'หักคะแนนตามจำนวนวันที่ส่งงานล่าช้า'),
      jsonb_build_object('dueDate', v_due_date, 'asOfDate', p_as_of_date, 'targetPenalty', v_target)
    );
  ELSIF v_delta < 0 THEN
    INSERT INTO "BriefingPointLedger" (
      "BriefingID", "UserID", "EntryType", "Points", "LateDays", "ReviewerID", "Comment", "Metadata"
    ) VALUES (
      p_briefing_id, p_user_id, 'LATE_REFUND', ABS(v_delta), v_late_days, p_actor_id,
      COALESCE(NULLIF(p_reason, ''), 'คืนคะแนนหลังขยายกำหนดส่ง'),
      jsonb_build_object('dueDate', v_due_date, 'asOfDate', p_as_of_date, 'targetPenalty', v_target)
    );
  END IF;
  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_briefing_late_penalty(TEXT, TEXT, DATE, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_briefing_late_penalties()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment RECORD;
  v_as_of DATE;
  v_count INTEGER := 0;
BEGIN
  FOR v_assignment IN
    SELECT b."ID" AS "BriefingID", assignee."UserID", response."SubmittedAt"
    FROM "Briefings" b
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(b."Assignees", '[]'::jsonb)) AS assignee("UserID")
    LEFT JOIN "BriefingResponses" response
      ON response."BriefingID" = b."ID" AND response."UserID" = assignee."UserID"
    WHERE b."LatePenaltyEnabled" = true
      AND b."Status" NOT IN ('เสร็จสิ้น', 'ยกเลิกงาน')
      AND NULLIF(btrim(COALESCE(b."DueDate", '')), '') IS NOT NULL
  LOOP
    v_as_of := COALESCE(
      (timezone('Asia/Bangkok', v_assignment."SubmittedAt"))::DATE,
      (timezone('Asia/Bangkok', now()))::DATE
    );
    PERFORM public.sync_briefing_late_penalty(
      v_assignment."BriefingID", v_assignment."UserID", v_as_of, NULL, 'ปรับคะแนนล่าช้าอัตโนมัติ'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_briefing_late_penalties() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.submit_briefing_response(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.submit_briefing_response(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB);
CREATE FUNCTION public.submit_briefing_response(
  p_briefing_id TEXT,
  p_user_id TEXT,
  p_url1 TEXT,
  p_url2 TEXT,
  p_note TEXT,
  p_result_images JSONB,
  p_review_images JSONB
)
RETURNS "Briefings"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_briefing "Briefings"%ROWTYPE;
  v_response_id TEXT;
  v_now TIMESTAMP WITH TIME ZONE := timezone('utc'::text, now());
BEGIN
  SELECT * INTO v_briefing FROM "Briefings" WHERE "ID" = p_briefing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Briefing not found'; END IF;
  IF v_briefing."Status" IN ('เสร็จสิ้น', 'ยกเลิกงาน') THEN
    RAISE EXCEPTION 'Completed or cancelled work cannot be submitted again';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_briefing."Assignees", '[]'::jsonb)) AS assignee("UserID")
    WHERE assignee."UserID" = p_user_id
  ) THEN RAISE EXCEPTION 'Only an assigned recipient may submit this work'; END IF;
  SELECT "ID" INTO v_response_id FROM "BriefingResponses"
  WHERE "BriefingID" = p_briefing_id AND "UserID" = p_user_id
  ORDER BY "UpdatedAt" DESC LIMIT 1 FOR UPDATE;
  IF v_response_id IS NULL THEN
    INSERT INTO "BriefingResponses" (
      "ID", "BriefingID", "UserID", "URL1", "URL2", "Note", "ResultImages", "ReviewImages",
      "Status", "SubmittedAt", "UpdatedAt"
    ) VALUES (
      gen_random_uuid()::TEXT, p_briefing_id, p_user_id, COALESCE(p_url1, ''), COALESCE(p_url2, ''),
      COALESCE(p_note, ''), COALESCE(p_result_images, '[]'::jsonb), COALESCE(p_review_images, '[]'::jsonb),
      'รอตรวจ', v_now, v_now
    );
  ELSE
    UPDATE "BriefingResponses"
    SET "URL1" = COALESCE(p_url1, ''), "URL2" = COALESCE(p_url2, ''), "Note" = COALESCE(p_note, ''),
        "ResultImages" = COALESCE(p_result_images, '[]'::jsonb), "ReviewImages" = COALESCE(p_review_images, '[]'::jsonb),
        "Status" = 'รอตรวจ', "SubmittedAt" = v_now, "UpdatedAt" = v_now
    WHERE "ID" = v_response_id;
  END IF;

  UPDATE "Briefings"
  SET "Status" = 'รอตรวจ', "ReviewSubmittedAt" = v_now,
      "UpdatedAt" = v_now, "LastUpdatedBy" = p_user_id
  WHERE "ID" = p_briefing_id
  RETURNING * INTO v_briefing;

  PERFORM public.sync_briefing_late_penalty(
    p_briefing_id, p_user_id, (timezone('Asia/Bangkok', v_now))::DATE,
    p_user_id, 'คำนวณเมื่อผู้รับมอบหมายบันทึกส่งงาน'
  );

  INSERT INTO "BriefingReviewHistory" ("BriefingID", "ReviewerID", "Action", "Comment", "TargetUserIDs")
  VALUES (p_briefing_id, p_user_id, 'SUBMITTED', 'ผู้รับมอบหมายบันทึกส่งงานและเปลี่ยนสถานะเป็นรอตรวจ', jsonb_build_array(p_user_id));
  RETURN v_briefing;
END;
$$;

DROP FUNCTION IF EXISTS public.save_briefing_review_settings(TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.save_briefing_review_settings(TEXT, TEXT, INTEGER, INTEGER, INTEGER);
CREATE FUNCTION public.save_briefing_review_settings(
  p_department TEXT,
  p_updated_by TEXT,
  p_correction_deduction INTEGER,
  p_rejected_deduction INTEGER,
  p_severe_deduction INTEGER
)
RETURNS "BriefingReviewSettings"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user "Users"%ROWTYPE;
  v_settings "BriefingReviewSettings"%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM "Users" WHERE "ID" = p_updated_by;
  IF NOT FOUND OR (v_user."Role" <> 'Admin' AND (v_user."Role" <> 'Head' OR v_user."Department" IS DISTINCT FROM p_department)) THEN
    RAISE EXCEPTION 'Only the department head or an admin may change review deductions';
  END IF;
  IF p_correction_deduction < 0 OR p_rejected_deduction < 0 OR p_severe_deduction < 0 THEN
    RAISE EXCEPTION 'Deductions cannot be negative';
  END IF;
  INSERT INTO "BriefingReviewSettings" (
    "Department", "CorrectionDeduction", "RejectedDeduction", "SevereDeduction", "UpdatedBy", "UpdatedAt"
  ) VALUES (
    p_department, p_correction_deduction, p_rejected_deduction, p_severe_deduction,
    p_updated_by, timezone('utc'::text, now())
  )
  ON CONFLICT ("Department") DO UPDATE
  SET "CorrectionDeduction" = EXCLUDED."CorrectionDeduction",
      "RejectedDeduction" = EXCLUDED."RejectedDeduction",
      "SevereDeduction" = EXCLUDED."SevereDeduction",
      "UpdatedBy" = EXCLUDED."UpdatedBy",
      "UpdatedAt" = EXCLUDED."UpdatedAt"
  RETURNING * INTO v_settings;
  RETURN v_settings;
END;
$$;

DROP FUNCTION IF EXISTS public.review_briefing(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS public.review_briefing(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT[], INTEGER, INTEGER);
CREATE FUNCTION public.review_briefing(
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
    IF p_extra_points IS NULL OR p_extra_points < 1 THEN RAISE EXCEPTION 'Additional work points must be at least 1'; END IF;
    IF btrim(COALESCE(p_comment, '')) = '' THEN RAISE EXCEPTION 'Additional work details are required'; END IF;
    UPDATE "Briefings"
    SET "Points" = COALESCE("Points", 0) + p_extra_points, "Status" = 'สั่งเพิ่มงาน',
        "UpdatedAt" = v_now, "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id RETURNING * INTO v_briefing;
    UPDATE "BriefingResponses" SET "Status" = 'สั่งเพิ่มงาน', "SubmittedAt" = NULL, "UpdatedAt" = v_now
    WHERE "BriefingID" = p_briefing_id;
    INSERT INTO "BriefingReviewHistory" ("BriefingID", "ReviewerID", "Action", "Comment", "ExtraPoints")
    VALUES (p_briefing_id, p_reviewer_id, 'EXTRA_WORK', p_comment, p_extra_points);
    RETURN v_briefing;
  END IF;

  IF p_action NOT IN ('needs_revision', 'rejected', 'severe_error', 'approved') THEN RAISE EXCEPTION 'Unsupported review action'; END IF;
  IF p_action IN ('needs_revision', 'rejected', 'severe_error') AND btrim(COALESCE(p_comment, '')) = '' THEN
    RAISE EXCEPTION 'A comment is required for this review action';
  END IF;

  IF p_action IN ('rejected', 'severe_error') THEN
    IF COALESCE(cardinality(p_target_user_ids), 0) = 0 THEN RAISE EXCEPTION 'Select at least one responsible recipient'; END IF;
    FOR v_target_user_id IN SELECT DISTINCT unnest(p_target_user_ids)
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_briefing."Assignees", '[]'::jsonb)) AS assignee("UserID")
        WHERE assignee."UserID" = v_target_user_id
      ) THEN RAISE EXCEPTION 'A selected user is not assigned to this briefing'; END IF;
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
    v_actual_deduction := LEAST(v_correction_deduction, v_remaining_points::INTEGER);
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

CREATE OR REPLACE FUNCTION public.get_briefing_point_ledger(
  p_viewer_id TEXT,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  "ID" UUID,
  "BriefingID" TEXT,
  "RunningID" TEXT,
  "Title" TEXT,
  "UserID" TEXT,
  "UserName" TEXT,
  "Department" TEXT,
  "EntryType" TEXT,
  "Points" NUMERIC,
  "LateDays" INTEGER,
  "ReviewerID" TEXT,
  "ReviewerName" TEXT,
  "Comment" TEXT,
  "CreatedAt" TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer "Users"%ROWTYPE;
BEGIN
  SELECT * INTO v_viewer FROM "Users" WHERE "Users"."ID" = p_viewer_id;
  IF NOT FOUND OR v_viewer."Role" NOT IN ('Admin', 'Head') THEN RAISE EXCEPTION 'Only a head or admin may view team point deductions'; END IF;
  RETURN QUERY
  SELECT ledger."ID", ledger."BriefingID", briefing."RunningID", briefing."Title",
         ledger."UserID", target."Name", target."Department", ledger."EntryType",
         ledger."Points", ledger."LateDays", ledger."ReviewerID", reviewer."Name",
         ledger."Comment", ledger."CreatedAt"
  FROM "BriefingPointLedger" ledger
  JOIN "Briefings" briefing ON briefing."ID" = ledger."BriefingID"
  JOIN "Users" target ON target."ID" = ledger."UserID"
  LEFT JOIN "Users" reviewer ON reviewer."ID" = ledger."ReviewerID"
  WHERE (v_viewer."Role" = 'Admin' OR target."Department" IS NOT DISTINCT FROM v_viewer."Department")
    AND (p_start_date IS NULL OR (timezone('Asia/Bangkok', ledger."CreatedAt"))::DATE >= p_start_date)
    AND (p_end_date IS NULL OR (timezone('Asia/Bangkok', ledger."CreatedAt"))::DATE <= p_end_date)
  ORDER BY ledger."CreatedAt" DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_briefing_response(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_briefing_review_settings(TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_briefing(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT[], INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_briefing_point_ledger(TEXT, DATE, DATE) TO anon, authenticated;

-- Run automatic lateness reconciliation shortly after midnight in Bangkok
-- when pg_cron is available. The submission and extension RPCs still perform
-- the same calculation immediately, so the workflow is correct without cron.
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR v_job_id IN SELECT jobid FROM cron.job WHERE jobname = 'briefing-late-penalties-daily'
    LOOP PERFORM cron.unschedule(v_job_id); END LOOP;
    PERFORM cron.schedule(
      'briefing-late-penalties-daily',
      '10 17 * * *',
      'SELECT public.refresh_briefing_late_penalties();'
    );
  END IF;
EXCEPTION
  WHEN undefined_table OR insufficient_privilege THEN
    RAISE NOTICE 'pg_cron schedule was not installed; submission-time reconciliation remains active';
END;
$$;

COMMIT;
