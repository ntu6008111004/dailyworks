-- Weekly / monthly work reports ("ส่งสรุปงาน")
--
-- Anyone with the page permission can post a summary of their week or month:
-- a title, a free-text detail, an optional link (a LINE album or note) and up
-- to 25 attachments — images, PDF, Word, PowerPoint, Excel, Markdown or text.
-- Images are compressed in the browser before upload exactly like briefing
-- images; text-like documents are gzipped in the browser when that saves
-- space. Rows only store Storage URLs plus file metadata, never file bytes.
--
-- Writes go through save_work_report()/delete_work_report() so the 25-file
-- cap, the permission flag and "only the author or an admin may change it"
-- hold even if the browser is bypassed.

BEGIN;

CREATE TABLE IF NOT EXISTS "WorkReports" (
  "ID" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Title" TEXT NOT NULL CHECK (char_length(btrim("Title")) BETWEEN 1 AND 200),
  "Detail" TEXT NOT NULL DEFAULT '',
  "PeriodType" TEXT NOT NULL DEFAULT 'weekly'
    CHECK ("PeriodType" IN ('weekly', 'monthly', 'other')),
  "PeriodStart" DATE,
  "PeriodEnd" DATE,
  "RefURL" TEXT NOT NULL DEFAULT '',
  "Attachments" JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof("Attachments") = 'array' AND jsonb_array_length("Attachments") <= 25),
  "CreatorID" TEXT REFERENCES "Users"("ID") ON DELETE SET NULL,
  -- Snapshot of the author's department when the report was posted, so a
  -- later transfer does not move old reports to another team's list.
  "Department" TEXT NOT NULL DEFAULT '',
  "CreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  "UpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK ("PeriodStart" IS NULL OR "PeriodEnd" IS NULL OR "PeriodEnd" >= "PeriodStart")
);

CREATE INDEX IF NOT EXISTS idx_work_reports_created ON "WorkReports"("CreatedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_work_reports_creator ON "WorkReports"("CreatorID");
CREATE INDEX IF NOT EXISTS idx_work_reports_department ON "WorkReports"("Department");

-- Read directly (the page filters by department); write only through the RPCs.
GRANT SELECT ON TABLE "WorkReports" TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE "WorkReports" FROM anon, authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "WorkReports";
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END;
$$;

-- Documents live in their own bucket: the image bucket only accepts images
-- up to 2 MB, and widening it would loosen every other upload in the app.
-- .md/.txt/.csv and legacy .doc/.ppt/.xls may arrive gzipped (application/gzip).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'worklog-files',
  'worklog-files',
  true,
  26214400,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/markdown',
    'text/plain',
    'text/csv',
    'application/gzip',
    'image/webp',
    'image/jpeg',
    'image/png',
    'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "worklog files are readable" ON storage.objects;
CREATE POLICY "worklog files are readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'worklog-files');

DROP POLICY IF EXISTS "worklog files can be uploaded" ON storage.objects;
CREATE POLICY "worklog files can be uploaded"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'worklog-files');

-- Keep only well-formed attachment entries with an http(s) URL, at most 25.
CREATE OR REPLACE FUNCTION public.sanitize_work_report_attachments(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_clean JSONB := '[]'::jsonb;
  v_item JSONB;
  v_url TEXT;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR v_item IN SELECT jsonb_array_elements(p_items)
  LOOP
    CONTINUE WHEN jsonb_typeof(v_item) <> 'object';
    v_url := btrim(COALESCE(v_item->>'url', ''));
    CONTINUE WHEN v_url = '' OR length(v_url) > 1000 OR v_url !~* '^https?://';
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'url', v_url,
      'path', left(COALESCE(v_item->>'path', ''), 500),
      'name', left(COALESCE(NULLIF(btrim(v_item->>'name'), ''), 'ไฟล์แนบ'), 255),
      'kind', CASE WHEN v_item->>'kind' = 'image' THEN 'image' ELSE 'file' END,
      'mimeType', left(COALESCE(v_item->>'mimeType', ''), 150),
      'size', CASE WHEN COALESCE(v_item->>'size', '') ~ '^\d{1,12}$' THEN (v_item->>'size')::BIGINT ELSE 0 END,
      'originalSize', CASE WHEN COALESCE(v_item->>'originalSize', '') ~ '^\d{1,12}$' THEN (v_item->>'originalSize')::BIGINT ELSE 0 END,
      'encoding', CASE WHEN v_item->>'encoding' = 'gzip' THEN 'gzip' ELSE '' END
    ));
    EXIT WHEN jsonb_array_length(v_clean) >= 25;
  END LOOP;
  RETURN v_clean;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_work_report(
  p_user_id TEXT,
  p_report_id UUID,
  p_title TEXT,
  p_detail TEXT,
  p_period_type TEXT,
  p_period_start DATE,
  p_period_end DATE,
  p_ref_url TEXT,
  p_attachments JSONB
)
RETURNS "WorkReports"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user "Users"%ROWTYPE;
  v_report "WorkReports"%ROWTYPE;
  v_now TIMESTAMP WITH TIME ZONE := timezone('utc'::text, now());
  v_title TEXT := btrim(COALESCE(p_title, ''));
  v_type TEXT := COALESCE(NULLIF(p_period_type, ''), 'weekly');
BEGIN
  SELECT * INTO v_user FROM "Users" WHERE "ID" = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporting user not found'; END IF;
  IF v_user."Role" <> 'Admin'
    AND (COALESCE(v_user."Permissions"->>'canViewReportsPage', 'true') = 'false'
      OR COALESCE(v_user."Permissions"->>'canSubmitReport', 'true') = 'false') THEN
    RAISE EXCEPTION 'You do not have permission to submit reports';
  END IF;
  IF v_title = '' THEN RAISE EXCEPTION 'Report title is required'; END IF;
  IF v_type NOT IN ('weekly', 'monthly', 'other') THEN RAISE EXCEPTION 'Unknown report period'; END IF;
  IF p_period_start IS NOT NULL AND p_period_end IS NOT NULL AND p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Report period ends before it starts';
  END IF;

  IF p_report_id IS NULL THEN
    INSERT INTO "WorkReports" (
      "Title", "Detail", "PeriodType", "PeriodStart", "PeriodEnd", "RefURL",
      "Attachments", "CreatorID", "Department", "CreatedAt", "UpdatedAt"
    ) VALUES (
      left(v_title, 200), COALESCE(p_detail, ''), v_type, p_period_start, p_period_end,
      left(btrim(COALESCE(p_ref_url, '')), 1000),
      public.sanitize_work_report_attachments(p_attachments),
      v_user."ID", COALESCE(v_user."Department", ''), v_now, v_now
    )
    RETURNING * INTO v_report;
    RETURN v_report;
  END IF;

  SELECT * INTO v_report FROM "WorkReports" WHERE "ID" = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF v_report."CreatorID" IS DISTINCT FROM v_user."ID" AND v_user."Role" <> 'Admin' THEN
    RAISE EXCEPTION 'Only the author or an admin can edit this report';
  END IF;

  UPDATE "WorkReports"
  SET "Title" = left(v_title, 200),
      "Detail" = COALESCE(p_detail, ''),
      "PeriodType" = v_type,
      "PeriodStart" = p_period_start,
      "PeriodEnd" = p_period_end,
      "RefURL" = left(btrim(COALESCE(p_ref_url, '')), 1000),
      "Attachments" = public.sanitize_work_report_attachments(p_attachments),
      "UpdatedAt" = v_now
  WHERE "ID" = p_report_id
  RETURNING * INTO v_report;
  RETURN v_report;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_work_report(p_user_id TEXT, p_report_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user "Users"%ROWTYPE;
  v_report "WorkReports"%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM "Users" WHERE "ID" = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporting user not found'; END IF;
  SELECT * INTO v_report FROM "WorkReports" WHERE "ID" = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_report."CreatorID" IS DISTINCT FROM v_user."ID" AND v_user."Role" <> 'Admin' THEN
    RAISE EXCEPTION 'Only the author or an admin can delete this report';
  END IF;
  DELETE FROM "WorkReports" WHERE "ID" = p_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sanitize_work_report_attachments(JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_work_report(TEXT, UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_work_report(TEXT, UUID) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
