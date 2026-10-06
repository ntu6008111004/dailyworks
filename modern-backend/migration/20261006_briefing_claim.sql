-- Self-claim for briefings nobody has been assigned to.
-- Run after 20261006_briefing_member_scores.sql.
--
-- Usually the person briefing the work picks the assignee. A brief saved
-- without one now sits in "ไม่มีผู้รับผิดชอบ" on the briefing page, where
-- anyone may claim it. Claiming makes the claimer the only assignee; from
-- there the brief follows the normal workflow (start, submit, review, score).
--
-- The row is locked, so two people pressing "รับงานนี้" together cannot both
-- get it: the second one is told it has already been taken.

BEGIN;

ALTER TABLE "BriefingReviewHistory"
  DROP CONSTRAINT IF EXISTS "BriefingReviewHistory_Action_check";
ALTER TABLE "BriefingReviewHistory"
  ADD CONSTRAINT "BriefingReviewHistory_Action_check"
  CHECK ("Action" IN (
    'SUBMITTED', 'NEEDS_REVISION', 'REJECTED', 'SEVERE_ERROR', 'APPROVED',
    'BONUS_UPDATED', 'SCORE_ADJUSTED', 'DEADLINE_EXTENDED', 'EXTRA_WORK',
    'MEMBER_SCORED', 'CLAIMED'
  ));

CREATE OR REPLACE FUNCTION public.claim_briefing(
  p_briefing_id TEXT,
  p_user_id TEXT
)
RETURNS "Briefings"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_briefing "Briefings"%ROWTYPE;
  v_now TIMESTAMP WITH TIME ZONE := timezone('utc'::text, now());
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Users" WHERE "ID" = p_user_id) THEN
    RAISE EXCEPTION 'Claiming user not found';
  END IF;
  SELECT * INTO v_briefing FROM "Briefings" WHERE "ID" = p_briefing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Briefing not found'; END IF;
  IF v_briefing."Status" IN ('เสร็จสิ้น', 'ยกเลิกงาน') THEN
    RAISE EXCEPTION 'Completed or cancelled work cannot be claimed';
  END IF;
  -- Old rows may hold the list as a JSON string ("[\"id\"]"); only a truly
  -- empty list (or none at all) counts as unassigned.
  IF (jsonb_typeof(v_briefing."Assignees") = 'array' AND jsonb_array_length(v_briefing."Assignees") > 0)
    OR (jsonb_typeof(v_briefing."Assignees") = 'string'
      AND btrim(v_briefing."Assignees" #>> '{}') NOT IN ('', '[]')) THEN
    RAISE EXCEPTION 'This briefing already has an assignee';
  END IF;

  UPDATE "Briefings"
  SET "Assignees" = jsonb_build_array(p_user_id),
      "UpdatedAt" = v_now, "LastUpdatedBy" = p_user_id
  WHERE "ID" = p_briefing_id
  RETURNING * INTO v_briefing;

  INSERT INTO "BriefingReviewHistory" ("BriefingID", "ReviewerID", "Action", "Comment", "TargetUserIDs")
  VALUES (p_briefing_id, p_user_id, 'CLAIMED', 'รับงานที่ยังไม่มีผู้รับผิดชอบ', jsonb_build_array(p_user_id));
  RETURN v_briefing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_briefing(TEXT, TEXT) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
