// Production can run a newer bundle than the database for a short window after
// a deploy. Selecting a column the database does not have makes PostgREST answer
// 400 for every briefing list, so the select degrades one migration at a time,
// newest column first, and the working level is remembered for the session.

const LEGACY_FIELDS = 'ID, RunningID, Title, CreatorID, Detail, CreatorNote, Assignees, Status, Priority, StartDate, DueDate, LastUpdatedBy, CreatedAt, UpdatedAt, CompletedAt, CardColor, PostStatus, PostUrl, PostDate, Points';
const REVIEW_FIELDS = `${LEGACY_FIELDS}, ReviewSubmittedAt, ReviewedAt, ReviewedBy, DeductedPoints, CorrectionCount, RejectedCount, SevereErrorCount, LatePenaltyEnabled, TotalExtendedDays, BonusPoints, FinalPoints`;
const BONUS_FIELDS = `${REVIEW_FIELDS}, BonusLevel`;
const SCORE_FIELDS = `${BONUS_FIELDS}, ScoreAdjustment`;

// Ordered newest migration first: ScoreAdjustment shipped after BonusLevel, so
// it has to be the first column dropped, otherwise a database missing only
// ScoreAdjustment burns an extra guaranteed 400 on every list.
export const BRIEFING_SELECT_LADDER = [SCORE_FIELDS, BONUS_FIELDS, REVIEW_FIELDS, LEGACY_FIELDS];

export const BRIEFING_SELECT_STORAGE_KEY = 'briefing_select_level_v3';

export function isMissingSchemaField(error) {
  if (!error) return false;
  const text = [error.message, error.details, error.hint, error.code].filter(Boolean).join(' ');
  return ['42703', 'PGRST204'].includes(String(error.code || ''))
    || /column|schema cache|scoreadjustment|bonuslevel|reviewsubmittedat|deductedpoints/i.test(text);
}

export function briefingSelectAt(index) {
  const safeIndex = Math.min(Math.max(Number(index) || 0, 0), BRIEFING_SELECT_LADDER.length - 1);
  return BRIEFING_SELECT_LADDER[safeIndex];
}

/** Returns the next narrower level, or -1 when even the legacy select failed. */
export function nextBriefingSelectIndex(index) {
  const next = (Number(index) || 0) + 1;
  return next < BRIEFING_SELECT_LADDER.length ? next : -1;
}

// A narrower level is only a snapshot of the database at one moment: once the
// pending migration lands, the full select works again. Remembering the level
// forever would keep hiding the new columns (ScoreAdjustment, BonusLevel) from
// every list for the rest of the session, so the memory expires and level 0 is
// probed again.
export const BRIEFING_SELECT_RETRY_MS = 10 * 60 * 1000;

export function readBriefingSelectIndex(storage, now = Date.now()) {
  try {
    const stored = JSON.parse(storage?.getItem(BRIEFING_SELECT_STORAGE_KEY) || 'null');
    if (stored && Number.isInteger(stored.i) && stored.i > 0 && stored.i < BRIEFING_SELECT_LADDER.length
      && Number.isFinite(stored.until) && now < stored.until) {
      return stored.i;
    }
  } catch {
    // A blocked sessionStorage only costs one probe per page load.
  }
  return 0;
}

export function rememberBriefingSelectIndex(index, storage, now = Date.now()) {
  if (!Number.isInteger(index) || index <= 0) return;
  try {
    storage?.setItem(BRIEFING_SELECT_STORAGE_KEY, JSON.stringify({ i: index, until: now + BRIEFING_SELECT_RETRY_MS }));
  } catch {
    // A blocked sessionStorage only costs one probe per page load.
  }
}
