const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export const POINT_LEDGER_LABELS = {
  LATE_PENALTY: 'งานล่าช้า',
  LATE_REFUND: 'คืนคะแนนจากการขยายเวลา',
  ERROR_PENALTY: 'ความผิดพลาด',
  SEVERE_ERROR_PENALTY: 'ความผิดพลาดร้ายแรง',
};

export function toBangkokDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

/**
 * First and last day of the current month in Bangkok time, as YYYY-MM-DD.
 * The briefing and team views pin their date filters to this range so daily
 * work always opens on the month being scored.
 */
export function getBangkokMonthRange(value = Date.now()) {
  const todayKey = toBangkokDateKey(value);
  if (!todayKey) return { start: '', end: '' };
  const [year, month] = todayKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return { start: `${prefix}-01`, end: `${prefix}-${String(lastDay).padStart(2, '0')}` };
}

export function getBriefingReviewParticipants(briefing, users = []) {
  const creatorId = String(briefing?.CreatorID || '');
  let assigneeIds = briefing?.Assignees || [];
  if (!Array.isArray(assigneeIds)) {
    try { assigneeIds = JSON.parse(assigneeIds || '[]'); } catch { assigneeIds = []; }
  }
  const participantIds = [creatorId, ...assigneeIds.map(String)]
    .filter((id, index, list) => id && list.indexOf(id) === index);
  return participantIds.map((id) => ({
    id,
    person: users.find((user) => String(user.ID) === id),
    roleLabel: id === creatorId ? 'ผู้บรีฟงาน' : 'ผู้รับงาน',
  }));
}

/**
 * Days the work is past its due date as of today in Bangkok. The review
 * dialog prefills the extension field with this so the head only confirms —
 * exactly the days needed to make the work on time again.
 */
export function getOverdueDays(dueDate, now = Date.now()) {
  const due = String(dueDate || '').slice(0, 10);
  const today = toBangkokDateKey(now);
  if (!due || !today) return 0;
  const difference = Math.round((new Date(today) - new Date(due)) / 86400000);
  return Number.isFinite(difference) ? Math.max(0, difference) : 0;
}

export function getLatePenaltyPoints(lateDays) {
  const days = Math.max(0, Math.trunc(number(lateDays)));
  if (days === 0) return 0;
  if (days === 1) return 1;
  if (days <= 3) return 4;
  return 8;
}

export function summarizePointLedger(entries = []) {
  const summary = {
    latePenalty: 0,
    errorPenalty: 0,
    severePenalty: 0,
    refunded: 0,
    deducted: 0,
    netDeduction: 0,
  };
  entries.forEach((entry) => {
    const points = Math.max(0, number(entry?.Points));
    if (entry?.EntryType === 'LATE_PENALTY') summary.latePenalty += points;
    if (entry?.EntryType === 'ERROR_PENALTY') summary.errorPenalty += points;
    if (entry?.EntryType === 'SEVERE_ERROR_PENALTY') summary.severePenalty += points;
    if (entry?.EntryType === 'LATE_REFUND') summary.refunded += points;
  });
  summary.deducted = summary.latePenalty + summary.errorPenalty + summary.severePenalty;
  summary.netDeduction = Math.max(0, summary.deducted - summary.refunded);
  return summary;
}

export function getNetTeamPoints(earnedPoints, entries = []) {
  return Math.max(0, number(earnedPoints) - summarizePointLedger(entries).netDeduction);
}
