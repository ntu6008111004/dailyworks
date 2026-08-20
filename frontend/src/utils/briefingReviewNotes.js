// Review instructions written by a department head must reach the briefing page
// itself, not only the review queue. The mapping lives here so the same labels
// are used by the review dialog, the briefing modal and the tests.

export const REVIEW_ACTION_LABELS = {
  NEEDS_REVISION: 'สั่งแก้ไข',
  REJECTED: 'ความผิดพลาด',
  SEVERE_ERROR: 'ความผิดพลาดร้ายแรง',
  EXTRA_WORK: 'สั่งงานเพิ่ม',
  DEADLINE_EXTENDED: 'ขยายกำหนดส่ง',
  APPROVED: 'อนุมัติผ่าน',
  BONUS_UPDATED: 'ปรับระดับคะแนนพิเศษ',
  SCORE_ADJUSTED: 'ปรับคะแนนหลังปิดงาน',
};

// Actions that change what the recipient has to do. Only these are surfaced as
// an instruction on the briefing page; bonus/score bookkeeping is not an order.
const INSTRUCTION_ACTIONS = ['NEEDS_REVISION', 'REJECTED', 'SEVERE_ERROR', 'EXTRA_WORK', 'DEADLINE_EXTENDED'];

// A head may not send any of these without saying why, both in the dialog and
// in review_briefing(). 'approved' stays optional: passing needs no reason.
export const COMMENT_REQUIRED_ACTIONS = ['needs_revision', 'rejected', 'severe_error', 'extra_work', 'extend_deadline'];

const TONES = {
  NEEDS_REVISION: 'orange',
  REJECTED: 'rose',
  SEVERE_ERROR: 'red',
  EXTRA_WORK: 'sky',
  DEADLINE_EXTENDED: 'violet',
};

export function requiresReviewComment(action) {
  return COMMENT_REQUIRED_ACTIONS.includes(String(action || ''));
}

export function describeReviewAmount(entry) {
  const action = String(entry?.Action || '');
  if (action === 'NEEDS_REVISION' && Number(entry?.PointsDeducted) > 0) return `หักคะแนนงาน ${Number(entry.PointsDeducted)}`;
  if (action === 'EXTRA_WORK' && Number(entry?.ExtraPoints) > 0) return `เพิ่มคะแนนงาน +${Number(entry.ExtraPoints)}`;
  if (action === 'DEADLINE_EXTENDED' && Number(entry?.ExtensionDays) > 0) {
    return entry?.NewDueDate ? `ขยาย ${Number(entry.ExtensionDays)} วัน ถึง ${entry.NewDueDate}` : `ขยาย ${Number(entry.ExtensionDays)} วัน`;
  }
  return '';
}

function reviewerName(reviewerId, users) {
  const person = (users || []).find((item) => String(item?.ID) === String(reviewerId));
  return person?.Name || person?.Username || 'หัวหน้าแผนก';
}

/**
 * Turns raw BriefingReviewHistory rows into what the briefing page shows:
 * newest instruction first, each with a Thai label, the amount involved and the
 * mandatory note the head wrote.
 */
export function summarizeReviewNotes(history = [], users = []) {
  return (Array.isArray(history) ? history : [])
    .filter((entry) => INSTRUCTION_ACTIONS.includes(String(entry?.Action || '')))
    .map((entry) => ({
      id: String(entry.ID ?? `${entry.Action}-${entry.CreatedAt}`),
      action: String(entry.Action),
      label: REVIEW_ACTION_LABELS[entry.Action] || String(entry.Action),
      tone: TONES[entry.Action] || 'slate',
      amount: describeReviewAmount(entry),
      comment: String(entry.Comment || '').trim(),
      reviewer: reviewerName(entry.ReviewerID, users),
      createdAt: entry.CreatedAt || '',
    }))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export function getLatestReviewInstruction(history = [], users = []) {
  return summarizeReviewNotes(history, users)[0] || null;
}
