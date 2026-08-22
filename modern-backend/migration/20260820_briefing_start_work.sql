-- A recipient may mark a briefing as "กำลังทำ" with one button.
-- Run after 20260820_briefing_monthly_penalties.sql.
--
-- Recipients cannot edit the assigner's briefing row directly (the app and
-- updateBriefing() both refuse), so starting work goes through this function:
-- it checks the caller is an assignee, refuses work that is already in the
-- head's queue, closed or cancelled, marks the caller's own response row as
-- working, and flips the briefing status so the person who briefed the work
-- sees — and is notified through Realtime — that it has started.

CREATE OR REPLACE FUNCTION public.start_briefing_work(
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
  v_response_id TEXT;
  v_now TIMESTAMP WITH TIME ZONE := timezone('utc'::text, now());
BEGIN
  SELECT * INTO v_briefing FROM "Briefings" WHERE "ID" = p_briefing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Briefing not found'; END IF;
  IF v_briefing."Status" IN ('ส่งตรวจ', 'เสร็จสิ้น', 'ยกเลิกงาน') THEN
    RAISE EXCEPTION 'Work in review, completed or cancelled cannot be started';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_briefing."Assignees", '[]'::jsonb)) AS assignee("UserID")
    WHERE assignee."UserID" = p_user_id
  ) THEN RAISE EXCEPTION 'Only an assigned recipient may start this work'; END IF;

  -- The caller's own delivery row records that they are working; evidence
  -- already saved on it is kept untouched.
  SELECT "ID" INTO v_response_id FROM "BriefingResponses"
  WHERE "BriefingID" = p_briefing_id AND "UserID" = p_user_id
  ORDER BY "UpdatedAt" DESC LIMIT 1 FOR UPDATE;
  IF v_response_id IS NULL THEN
    INSERT INTO "BriefingResponses" (
      "ID", "BriefingID", "UserID", "URL1", "URL2", "Note", "ResultImages", "ReviewImages",
      "Status", "UpdatedAt"
    ) VALUES (
      gen_random_uuid()::TEXT, p_briefing_id, p_user_id, '', '', '', '[]'::jsonb, '[]'::jsonb,
      'กำลังทำ', v_now
    );
  ELSE
    UPDATE "BriefingResponses"
    SET "Status" = 'กำลังทำ', "UpdatedAt" = v_now
    WHERE "ID" = v_response_id;
  END IF;

  UPDATE "Briefings"
  SET "Status" = 'กำลังทำ', "UpdatedAt" = v_now, "LastUpdatedBy" = p_user_id
  WHERE "ID" = p_briefing_id
  RETURNING * INTO v_briefing;

  RETURN v_briefing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_briefing_work(TEXT, TEXT) TO anon, authenticated;
