-- A claimer is never late for days before they took the work.
-- Run after 20261006_briefing_claim.sql.
--
-- Unassigned briefs stay in "ไม่มีผู้รับผิดชอบ" even past their due date, and
-- lateness is counted from DueDate. Without this, whoever claims a brief due
-- last week is charged up to 8 points the moment the late-penalty refresh runs.
-- Claiming a brief whose due date has already passed now moves the due date to
-- the claim day (Bangkok time) and records the original date in the history.

BEGIN;

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
  v_today DATE := (timezone('Asia/Bangkok', now()))::DATE;
  v_due DATE;
  v_comment TEXT := 'รับงานที่ยังไม่มีผู้รับผิดชอบ';
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

  BEGIN
    v_due := NULLIF(btrim(COALESCE(v_briefing."DueDate", '')), '')::DATE;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    v_due := NULL;
  END;
  IF v_due IS NOT NULL AND v_due < v_today THEN
    v_comment := v_comment || ' (เลยกำหนดเดิม ' || to_char(v_due, 'YYYY-MM-DD')
      || ' จึงเลื่อนกำหนดส่งเป็นวันที่รับงาน ' || to_char(v_today, 'YYYY-MM-DD') || ')';
  ELSE
    v_due := NULL;
  END IF;

  UPDATE "Briefings"
  SET "Assignees" = jsonb_build_array(p_user_id),
      "DueDate" = CASE WHEN v_due IS NOT NULL THEN to_char(v_today, 'YYYY-MM-DD') ELSE "DueDate" END,
      "UpdatedAt" = v_now, "LastUpdatedBy" = p_user_id
  WHERE "ID" = p_briefing_id
  RETURNING * INTO v_briefing;

  INSERT INTO "BriefingReviewHistory" (
    "BriefingID", "ReviewerID", "Action", "Comment", "TargetUserIDs", "PreviousDueDate", "NewDueDate"
  ) VALUES (
    p_briefing_id, p_user_id, 'CLAIMED', v_comment, jsonb_build_array(p_user_id),
    CASE WHEN v_due IS NOT NULL THEN to_char(v_due, 'YYYY-MM-DD') END,
    CASE WHEN v_due IS NOT NULL THEN to_char(v_today, 'YYYY-MM-DD') END
  );
  RETURN v_briefing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_briefing(TEXT, TEXT) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
