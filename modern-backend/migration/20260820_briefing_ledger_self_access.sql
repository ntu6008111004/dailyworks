-- Everyone may read their own monthly point ledger.
-- Run after 20260820_briefing_monthly_penalties.sql.
--
-- The personal dashboard shows each user their own net score, so the ledger
-- function stops rejecting non-head viewers and instead scopes what each role
-- can see: Admin reads everyone, a Head reads their department, and every
-- other user reads only their own rows.

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
  IF NOT FOUND THEN RAISE EXCEPTION 'Viewer not found'; END IF;
  RETURN QUERY
  SELECT ledger."ID", ledger."BriefingID", briefing."RunningID", briefing."Title",
         ledger."UserID", target."Name", target."Department", ledger."EntryType",
         ledger."Points", ledger."LateDays", ledger."ReviewerID", reviewer."Name",
         ledger."Comment", ledger."CreatedAt"
  FROM "BriefingPointLedger" ledger
  JOIN "Briefings" briefing ON briefing."ID" = ledger."BriefingID"
  JOIN "Users" target ON target."ID" = ledger."UserID"
  LEFT JOIN "Users" reviewer ON reviewer."ID" = ledger."ReviewerID"
  WHERE (
      v_viewer."Role" = 'Admin'
      OR (v_viewer."Role" = 'Head' AND target."Department" IS NOT DISTINCT FROM v_viewer."Department")
      OR ledger."UserID" = p_viewer_id
    )
    AND (p_start_date IS NULL OR (timezone('Asia/Bangkok', ledger."CreatedAt"))::DATE >= p_start_date)
    AND (p_end_date IS NULL OR (timezone('Asia/Bangkok', ledger."CreatedAt"))::DATE <= p_end_date)
  ORDER BY ledger."CreatedAt" DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_briefing_point_ledger(TEXT, DATE, DATE) TO anon, authenticated;
