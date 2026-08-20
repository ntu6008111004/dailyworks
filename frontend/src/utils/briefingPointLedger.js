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
