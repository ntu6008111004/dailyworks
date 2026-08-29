-- Review comments carry attached images
--
-- A department head used to be able to say what was wrong only in words. This
-- migration lets the same mandatory note carry up to six screenshots of the
-- mistake, so "แก้ตรงนี้" points at something the recipient can actually see.
--
-- review_briefing() itself is NOT rewritten. Its ~200 lines of deduction and
-- permission rules are wrapped instead, so the scoring behaviour that the
-- existing tests cover cannot drift while adding an attachment column.

ALTER TABLE "BriefingReviewHistory"
  ADD COLUMN IF NOT EXISTS "CommentImages" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- The client already caps the picker at six, but a review note is a permanent
-- record shown to the person being marked down: validate it server-side too.
-- Only http(s) URLs are stored, never base64, so the history row stays small.
CREATE OR REPLACE FUNCTION public.sanitize_review_comment_images(p_images JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_clean JSONB := '[]'::jsonb;
  v_url TEXT;
BEGIN
  IF p_images IS NULL OR jsonb_typeof(p_images) <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR v_url IN SELECT jsonb_array_elements_text(p_images)
  LOOP
    CONTINUE WHEN v_url IS NULL;
    v_url := btrim(v_url);
    CONTINUE WHEN v_url = '' OR length(v_url) > 1000;
    CONTINUE WHEN v_url !~* '^https?://';
    CONTINUE WHEN v_clean @> to_jsonb(ARRAY[v_url]);
    v_clean := v_clean || to_jsonb(v_url);
    EXIT WHEN jsonb_array_length(v_clean) >= 6;
  END LOOP;
  RETURN v_clean;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_briefing_with_images(
  p_briefing_id TEXT,
  p_reviewer_id TEXT,
  p_action TEXT,
  p_comment TEXT DEFAULT '',
  p_bonus_level TEXT DEFAULT NULL,
  p_target_points NUMERIC DEFAULT NULL,
  p_target_user_ids TEXT[] DEFAULT NULL,
  p_extra_points INTEGER DEFAULT NULL,
  p_extension_days INTEGER DEFAULT NULL,
  p_comment_images JSONB DEFAULT '[]'::jsonb
)
RETURNS "Briefings"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_briefing "Briefings"%ROWTYPE;
  v_images JSONB;
  v_history_id UUID;
BEGIN
  v_images := public.sanitize_review_comment_images(p_comment_images);

  -- Every permission, deduction and status rule stays in the original function.
  SELECT * INTO v_briefing FROM public.review_briefing(
    p_briefing_id, p_reviewer_id, p_action, p_comment, p_bonus_level,
    p_target_points, p_target_user_ids, p_extra_points, p_extension_days
  );

  IF jsonb_array_length(v_images) > 0 THEN
    -- review_briefing() writes exactly one history row per call, inside this
    -- same transaction, so the newest row for this reviewer is the one it just
    -- created. Requiring an empty CommentImages means a retry can never
    -- overwrite the pictures attached to an earlier instruction.
    SELECT "ID" INTO v_history_id
    FROM "BriefingReviewHistory"
    WHERE "BriefingID" = p_briefing_id
      AND "ReviewerID" = p_reviewer_id
      AND COALESCE(jsonb_array_length("CommentImages"), 0) = 0
    ORDER BY "CreatedAt" DESC
    LIMIT 1;

    IF v_history_id IS NOT NULL THEN
      UPDATE "BriefingReviewHistory"
      SET "CommentImages" = v_images
      WHERE "ID" = v_history_id;
    END IF;
  END IF;

  RETURN v_briefing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sanitize_review_comment_images(JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_briefing_with_images(
  TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT[], INTEGER, INTEGER, JSONB
) TO anon, authenticated;
