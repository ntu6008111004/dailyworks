-- Catch-up for databases that received 20260820_briefing_monthly_penalties.sql
-- but never received 20260820_briefing_score_adjustment.sql and
-- 20260820_briefing_bonus_levels.sql.
--
-- bonus_levels aborts on its "ScoreAdjustment" type change because that column
-- is added by score_adjustment, and since the whole file is one transaction its
-- "BonusLevel" columns roll back with it.  The functions from monthly_penalties
-- still install fine -- a plpgsql body is not name-checked at CREATE time -- so
-- review_briefing only fails at call time with
--   record "v_briefing" has no field "BonusLevel".
--
-- Only the missing schema is replayed here.  The functions already deployed by
-- monthly_penalties are the newest ones, and its wider
-- "BriefingReviewHistory_Action_check" is left alone (replaying the narrower
-- constraint from score_adjustment would reject SEVERE_ERROR, DEADLINE_EXTENDED
-- and EXTRA_WORK rows).

BEGIN;

-- from 20260820_briefing_score_adjustment.sql
ALTER TABLE "Briefings"
  ADD COLUMN IF NOT EXISTS "ScoreAdjustment" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "BriefingReviewHistory"
  ADD COLUMN IF NOT EXISTS "PreviousAwardedPoints" INTEGER,
  ADD COLUMN IF NOT EXISTS "NewAwardedPoints" INTEGER,
  ADD COLUMN IF NOT EXISTS "PointsDelta" INTEGER;

-- from 20260820_briefing_bonus_levels.sql
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

COMMIT;

-- Verify: every row below should be present, and the NUMERIC ones numeric.
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND (table_name = 'Briefings' AND column_name IN ('ScoreAdjustment', 'BonusLevel', 'BonusPoints', 'FinalPoints')
--     OR table_name = 'BriefingReviewHistory' AND column_name IN ('BonusLevel', 'BonusPoints', 'PreviousAwardedPoints', 'NewAwardedPoints', 'PointsDelta'))
-- ORDER BY table_name, column_name;
