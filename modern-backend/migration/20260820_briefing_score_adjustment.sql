-- Incremental score adjustment for reviewed briefings.
-- Run after 20260820_briefing_review_workflow.sql.  It never changes legacy
-- completed work because only a briefing that was completed by review may use
-- SCORE_ADJUSTED.

ALTER TABLE "Briefings"
  ADD COLUMN IF NOT EXISTS "ScoreAdjustment" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "BriefingReviewHistory"
  ADD COLUMN IF NOT EXISTS "PreviousAwardedPoints" INTEGER,
  ADD COLUMN IF NOT EXISTS "NewAwardedPoints" INTEGER,
  ADD COLUMN IF NOT EXISTS "PointsDelta" INTEGER;

ALTER TABLE "BriefingReviewHistory"
  DROP CONSTRAINT IF EXISTS "BriefingReviewHistory_Action_check";

ALTER TABLE "BriefingReviewHistory"
  ADD CONSTRAINT "BriefingReviewHistory_Action_check"
  CHECK ("Action" IN ('SUBMITTED', 'NEEDS_REVISION', 'REJECTED', 'APPROVED', 'BONUS_UPDATED', 'SCORE_ADJUSTED'));

DROP FUNCTION IF EXISTS public.review_briefing(TEXT, TEXT, TEXT, TEXT, INTEGER);

CREATE FUNCTION public.review_briefing(
  p_briefing_id TEXT,
  p_reviewer_id TEXT,
  p_action TEXT,
  p_comment TEXT DEFAULT '',
  p_bonus_points INTEGER DEFAULT NULL,
  p_target_points INTEGER DEFAULT NULL
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
  v_rejected_deduction INTEGER := 1;
  v_requested_deduction INTEGER := 0;
  v_actual_deduction INTEGER := 0;
  v_remaining_points INTEGER := 0;
  v_base_award INTEGER := 0;
  v_previous_award INTEGER := 0;
  v_new_award INTEGER := 0;
  v_now TIMESTAMP WITH TIME ZONE := timezone('utc'::text, now());
BEGIN
  SELECT * INTO v_briefing FROM "Briefings" WHERE "ID" = p_briefing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Briefing not found';
  END IF;

  SELECT * INTO v_reviewer FROM "Users" WHERE "ID" = p_reviewer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reviewer not found';
  END IF;
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
    IF p_target_points IS NULL OR p_target_points < 0 THEN
      RAISE EXCEPTION 'Target points must be zero or greater';
    END IF;

    v_base_award := GREATEST(0, COALESCE(v_briefing."FinalPoints", COALESCE(v_briefing."Points", 0) - COALESCE(v_briefing."DeductedPoints", 0)))
      + GREATEST(0, COALESCE(v_briefing."BonusPoints", 0));
    v_previous_award := GREATEST(0, v_base_award + COALESCE(v_briefing."ScoreAdjustment", 0));
    v_new_award := GREATEST(0, p_target_points);

    UPDATE "Briefings"
    SET "ScoreAdjustment" = v_new_award - v_base_award,
        "UpdatedAt" = v_now,
        "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id
    RETURNING * INTO v_briefing;

    INSERT INTO "BriefingReviewHistory" (
      "BriefingID", "ReviewerID", "Action", "Comment",
      "PreviousAwardedPoints", "NewAwardedPoints", "PointsDelta"
    ) VALUES (
      p_briefing_id, p_reviewer_id, 'SCORE_ADJUSTED', COALESCE(p_comment, ''),
      v_previous_award, v_new_award, v_new_award - v_previous_award
    );
    RETURN v_briefing;
  END IF;

  SELECT "CorrectionDeduction", "RejectedDeduction"
  INTO v_correction_deduction, v_rejected_deduction
  FROM "BriefingReviewSettings"
  WHERE "Department" = COALESCE(v_creator_department, '');

  v_correction_deduction := COALESCE(v_correction_deduction, 1);
  v_rejected_deduction := COALESCE(v_rejected_deduction, 1);

  IF p_action = 'bonus' THEN
    IF p_bonus_points IS NULL OR p_bonus_points < 0 OR p_bonus_points > 10 THEN
      RAISE EXCEPTION 'Bonus points must be between 0 and 10';
    END IF;
    UPDATE "Briefings"
    SET "BonusPoints" = p_bonus_points,
        "UpdatedAt" = v_now,
        "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id
    RETURNING * INTO v_briefing;

    INSERT INTO "BriefingReviewHistory" ("BriefingID", "ReviewerID", "Action", "Comment", "BonusPoints")
    VALUES (p_briefing_id, p_reviewer_id, 'BONUS_UPDATED', COALESCE(p_comment, ''), p_bonus_points);
    RETURN v_briefing;
  END IF;

  IF p_action NOT IN ('needs_revision', 'rejected', 'approved') THEN
    RAISE EXCEPTION 'Unsupported review action';
  END IF;
  IF p_action IN ('needs_revision', 'rejected') AND btrim(COALESCE(p_comment, '')) = '' THEN
    RAISE EXCEPTION 'A comment is required when requesting a revision or marking an error';
  END IF;

  IF p_action = 'needs_revision' THEN
    v_requested_deduction := v_correction_deduction;
  ELSIF p_action = 'rejected' THEN
    v_requested_deduction := v_rejected_deduction;
  END IF;
  v_remaining_points := GREATEST(0, COALESCE(v_briefing."Points", 0) - COALESCE(v_briefing."DeductedPoints", 0));
  v_actual_deduction := LEAST(v_requested_deduction, v_remaining_points);

  IF p_action = 'approved' THEN
    UPDATE "Briefings"
    SET "Status" = 'เสร็จสิ้น',
        "CompletedAt" = v_now,
        "ReviewedAt" = v_now,
        "ReviewedBy" = p_reviewer_id,
        "FinalPoints" = GREATEST(0, COALESCE("Points", 0) - COALESCE("DeductedPoints", 0)),
        "ScoreAdjustment" = 0,
        "UpdatedAt" = v_now,
        "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id
    RETURNING * INTO v_briefing;

    UPDATE "BriefingResponses"
    SET "Status" = 'เสร็จสิ้น', "UpdatedAt" = v_now
    WHERE "BriefingID" = p_briefing_id;

    INSERT INTO "BriefingReviewHistory" ("BriefingID", "ReviewerID", "Action", "Comment", "BonusPoints")
    VALUES (p_briefing_id, p_reviewer_id, 'APPROVED', COALESCE(p_comment, ''), COALESCE(v_briefing."BonusPoints", 0));
  ELSE
    UPDATE "Briefings"
    SET "Status" = CASE WHEN p_action = 'needs_revision' THEN 'สั่งแก้ไข' ELSE 'ส่งตรวจ' END,
        "DeductedPoints" = COALESCE("DeductedPoints", 0) + v_actual_deduction,
        "CorrectionCount" = COALESCE("CorrectionCount", 0) + CASE WHEN p_action = 'needs_revision' THEN 1 ELSE 0 END,
        "RejectedCount" = COALESCE("RejectedCount", 0) + CASE WHEN p_action = 'rejected' THEN 1 ELSE 0 END,
        "ReviewedBy" = p_reviewer_id,
        "UpdatedAt" = v_now,
        "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id
    RETURNING * INTO v_briefing;

    IF p_action = 'needs_revision' THEN
      UPDATE "BriefingResponses"
      SET "Status" = 'สั่งแก้ไข', "UpdatedAt" = v_now
      WHERE "BriefingID" = p_briefing_id;
    END IF;

    INSERT INTO "BriefingReviewHistory" ("BriefingID", "ReviewerID", "Action", "Comment", "PointsDeducted")
    VALUES (
      p_briefing_id,
      p_reviewer_id,
      CASE WHEN p_action = 'needs_revision' THEN 'NEEDS_REVISION' ELSE 'REJECTED' END,
      p_comment,
      v_actual_deduction
    );
  END IF;

  RETURN v_briefing;
END;
$$;
