-- Briefing review workflow and storage migration
-- Safe to run on an existing production database: completed legacy briefings
-- remain untouched and continue to render from their original image columns.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "Briefings"
  ADD COLUMN IF NOT EXISTS "RefImages" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "ReviewSubmittedAt" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "ReviewedAt" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "ReviewedBy" TEXT REFERENCES "Users"("ID") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "DeductedPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "CorrectionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "RejectedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "BonusPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "FinalPoints" INTEGER;

ALTER TABLE "BriefingResponses"
  ADD COLUMN IF NOT EXISTS "ResultImages" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "ReviewImages" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "BriefingReviewSettings" (
  "Department" TEXT PRIMARY KEY,
  "CorrectionDeduction" INTEGER NOT NULL DEFAULT 1 CHECK ("CorrectionDeduction" >= 0),
  "RejectedDeduction" INTEGER NOT NULL DEFAULT 1 CHECK ("RejectedDeduction" >= 0),
  "UpdatedBy" TEXT REFERENCES "Users"("ID") ON DELETE SET NULL,
  "UpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS "BriefingReviewHistory" (
  "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "BriefingID" TEXT NOT NULL REFERENCES "Briefings"("ID") ON DELETE CASCADE,
  "ReviewerID" TEXT REFERENCES "Users"("ID") ON DELETE SET NULL,
  "Action" TEXT NOT NULL CHECK ("Action" IN ('SUBMITTED', 'NEEDS_REVISION', 'REJECTED', 'APPROVED', 'BONUS_UPDATED')),
  "Comment" TEXT NOT NULL DEFAULT '',
  "PointsDeducted" INTEGER NOT NULL DEFAULT 0,
  "BonusPoints" INTEGER NOT NULL DEFAULT 0,
  "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_briefings_review_queue
  ON "Briefings"("Status", "CreatedAt" DESC)
  WHERE "Status" IN ('ส่งตรวจ', 'สั่งแก้ไข', 'รอตรวจ');
CREATE INDEX IF NOT EXISTS idx_briefing_review_history_briefing
  ON "BriefingReviewHistory"("BriefingID", "CreatedAt" DESC);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "Briefings";
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- All files uploaded after this migration use a public Storage URL.  Old
-- base64 values are intentionally not converted; the UI reads both formats.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'worklog-images',
  'worklog-images',
  true,
  2097152,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png'];

DROP POLICY IF EXISTS "worklog images are readable" ON storage.objects;
CREATE POLICY "worklog images are readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'worklog-images');

DROP POLICY IF EXISTS "worklog images can be uploaded" ON storage.objects;
CREATE POLICY "worklog images can be uploaded"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'worklog-images');

-- Perform every review transition atomically.  Existing completed work is
-- deliberately immutable: this workflow only applies to unfinished briefings.
CREATE OR REPLACE FUNCTION public.review_briefing(
  p_briefing_id TEXT,
  p_reviewer_id TEXT,
  p_action TEXT,
  p_comment TEXT DEFAULT '',
  p_bonus_points INTEGER DEFAULT NULL
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
  v_now TIMESTAMP WITH TIME ZONE := timezone('utc'::text, now());
BEGIN
  SELECT * INTO v_briefing FROM "Briefings" WHERE "ID" = p_briefing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Briefing not found';
  END IF;
  IF v_briefing."Status" = 'เสร็จสิ้น' THEN
    RAISE EXCEPTION 'Completed briefings cannot enter the new review workflow';
  END IF;

  SELECT * INTO v_reviewer FROM "Users" WHERE "ID" = p_reviewer_id;
  SELECT "Department" INTO v_creator_department FROM "Users" WHERE "ID" = v_briefing."CreatorID";
  IF NOT FOUND OR (v_reviewer."Role" <> 'Admin' AND (v_reviewer."Role" <> 'Head' OR v_reviewer."Department" IS DISTINCT FROM v_creator_department)) THEN
    RAISE EXCEPTION 'Only the department head or an admin may review this briefing';
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

CREATE OR REPLACE FUNCTION public.save_briefing_review_settings(
  p_department TEXT,
  p_updated_by TEXT,
  p_correction_deduction INTEGER,
  p_rejected_deduction INTEGER
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
  IF p_correction_deduction < 0 OR p_rejected_deduction < 0 THEN
    RAISE EXCEPTION 'Deductions cannot be negative';
  END IF;
  INSERT INTO "BriefingReviewSettings" ("Department", "CorrectionDeduction", "RejectedDeduction", "UpdatedBy", "UpdatedAt")
  VALUES (p_department, p_correction_deduction, p_rejected_deduction, p_updated_by, timezone('utc'::text, now()))
  ON CONFLICT ("Department") DO UPDATE
  SET "CorrectionDeduction" = EXCLUDED."CorrectionDeduction",
      "RejectedDeduction" = EXCLUDED."RejectedDeduction",
      "UpdatedBy" = EXCLUDED."UpdatedBy",
      "UpdatedAt" = EXCLUDED."UpdatedAt"
  RETURNING * INTO v_settings;
  RETURN v_settings;
END;
$$;
