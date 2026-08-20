-- Replace manually entered 0-10 bonus points with fixed quality levels.
-- Run after 20260820_briefing_score_adjustment.sql.
-- Multipliers use the non-negative score remaining after review deductions.

BEGIN;

ALTER TABLE "Briefings"
  ADD COLUMN IF NOT EXISTS "BonusLevel" TEXT;

ALTER TABLE "Briefings"
  DROP CONSTRAINT IF EXISTS "Briefings_BonusLevel_check";

ALTER TABLE "Briefings"
  ADD CONSTRAINT "Briefings_BonusLevel_check"
  CHECK ("BonusLevel" IS NULL OR "BonusLevel" IN ('standard', 'good', 'excellent', 'viral'));

ALTER TABLE "Briefings"
  ALTER COLUMN "BonusPoints" TYPE NUMERIC(12,2) USING COALESCE("BonusPoints", 0)::NUMERIC(12,2),
  ALTER COLUMN "BonusPoints" SET DEFAULT 0,
  ALTER COLUMN "FinalPoints" TYPE NUMERIC(12,2) USING "FinalPoints"::NUMERIC(12,2),
  ALTER COLUMN "ScoreAdjustment" TYPE NUMERIC(12,2) USING COALESCE("ScoreAdjustment", 0)::NUMERIC(12,2),
  ALTER COLUMN "ScoreAdjustment" SET DEFAULT 0;

ALTER TABLE "BriefingReviewHistory"
  ADD COLUMN IF NOT EXISTS "BonusLevel" TEXT;

ALTER TABLE "BriefingReviewHistory"
  ALTER COLUMN "BonusPoints" TYPE NUMERIC(12,2) USING COALESCE("BonusPoints", 0)::NUMERIC(12,2),
  ALTER COLUMN "PreviousAwardedPoints" TYPE NUMERIC(12,2) USING "PreviousAwardedPoints"::NUMERIC(12,2),
  ALTER COLUMN "NewAwardedPoints" TYPE NUMERIC(12,2) USING "NewAwardedPoints"::NUMERIC(12,2),
  ALTER COLUMN "PointsDelta" TYPE NUMERIC(12,2) USING "PointsDelta"::NUMERIC(12,2);

DROP FUNCTION IF EXISTS public.review_briefing(TEXT, TEXT, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.review_briefing(TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.review_briefing(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC);

CREATE FUNCTION public.review_briefing(
  p_briefing_id TEXT,
  p_reviewer_id TEXT,
  p_action TEXT,
  p_comment TEXT DEFAULT '',
  p_bonus_level TEXT DEFAULT NULL,
  p_target_points NUMERIC DEFAULT NULL
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
  v_remaining_points NUMERIC(12,2) := 0;
  v_bonus_level TEXT;
  v_bonus_points NUMERIC(12,2) := 0;
  v_base_award NUMERIC(12,2) := 0;
  v_previous_award NUMERIC(12,2) := 0;
  v_new_award NUMERIC(12,2) := 0;
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
    IF p_target_points IS NULL OR p_target_points < 0 THEN
      RAISE EXCEPTION 'Target points must be zero or greater';
    END IF;

    v_base_award := GREATEST(0, COALESCE(v_briefing."FinalPoints", COALESCE(v_briefing."Points", 0) - COALESCE(v_briefing."DeductedPoints", 0)))
      + GREATEST(0, COALESCE(v_briefing."BonusPoints", 0));
    v_previous_award := GREATEST(0, v_base_award + COALESCE(v_briefing."ScoreAdjustment", 0));
    v_new_award := GREATEST(0, ROUND(p_target_points, 2));

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
  v_remaining_points := GREATEST(0, COALESCE(v_briefing."Points", 0) - COALESCE(v_briefing."DeductedPoints", 0));

  IF p_action IN ('bonus', 'approved') THEN
    v_bonus_level := COALESCE(NULLIF(p_bonus_level, ''), v_briefing."BonusLevel", 'standard');
    IF v_bonus_level NOT IN ('standard', 'good', 'excellent', 'viral') THEN
      RAISE EXCEPTION 'Unsupported bonus level';
    END IF;
    v_bonus_points := CASE v_bonus_level
      WHEN 'good' THEN ROUND(v_remaining_points * 0.5, 2)
      WHEN 'excellent' THEN v_remaining_points
      WHEN 'viral' THEN 30
      ELSE 0
    END;
  END IF;

  IF p_action = 'bonus' THEN
    UPDATE "Briefings"
    SET "BonusLevel" = v_bonus_level,
        "BonusPoints" = v_bonus_points,
        "UpdatedAt" = v_now,
        "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id
    RETURNING * INTO v_briefing;

    INSERT INTO "BriefingReviewHistory" (
      "BriefingID", "ReviewerID", "Action", "Comment", "BonusLevel", "BonusPoints"
    ) VALUES (
      p_briefing_id, p_reviewer_id, 'BONUS_UPDATED', COALESCE(p_comment, ''), v_bonus_level, v_bonus_points
    );
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
  v_actual_deduction := LEAST(v_requested_deduction, v_remaining_points::INTEGER);

  IF p_action = 'approved' THEN
    UPDATE "Briefings"
    SET "Status" = 'เสร็จสิ้น',
        "CompletedAt" = v_now,
        "ReviewedAt" = v_now,
        "ReviewedBy" = p_reviewer_id,
        "FinalPoints" = v_remaining_points,
        "BonusLevel" = v_bonus_level,
        "BonusPoints" = v_bonus_points,
        "ScoreAdjustment" = 0,
        "UpdatedAt" = v_now,
        "LastUpdatedBy" = p_reviewer_id
    WHERE "ID" = p_briefing_id
    RETURNING * INTO v_briefing;

    UPDATE "BriefingResponses"
    SET "Status" = 'เสร็จสิ้น', "UpdatedAt" = v_now
    WHERE "BriefingID" = p_briefing_id;

    INSERT INTO "BriefingReviewHistory" (
      "BriefingID", "ReviewerID", "Action", "Comment", "BonusLevel", "BonusPoints"
    ) VALUES (
      p_briefing_id, p_reviewer_id, 'APPROVED', COALESCE(p_comment, ''), v_bonus_level, v_bonus_points
    );
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

    INSERT INTO "BriefingReviewHistory" (
      "BriefingID", "ReviewerID", "Action", "Comment", "PointsDeducted"
    ) VALUES (
      p_briefing_id, p_reviewer_id,
      CASE WHEN p_action = 'needs_revision' THEN 'NEEDS_REVISION' ELSE 'REJECTED' END,
      p_comment, v_actual_deduction
    );
  END IF;

  RETURN v_briefing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_briefing(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC) TO anon, authenticated;

COMMIT;
