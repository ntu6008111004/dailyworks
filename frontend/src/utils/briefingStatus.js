// One source of truth for briefing status keys.
//
// The Briefings table grew two labels for the same idea — work that was handed
// over but not started yet.  New briefings were written as 'ดำเนินการ' while
// every counter, filter and scoring rule was keyed on 'รอดำเนินการ', so a
// status the user could see on the card was missing from every total and the
// "รอดำเนินการ" card sat at 0 forever.  Everything now reads through
// normalizeBriefingStatus(); 'ดำเนินการ' survives only as an alias for rows
// written before the migration.

export const BRIEFING_STATUS_PENDING = 'รอดำเนินการ';

const STATUS_ALIASES = {
  'ดำเนินการ': BRIEFING_STATUS_PENDING,
  'ยังไม่เริ่ม': BRIEFING_STATUS_PENDING,
  'รอแก้': 'รอแก้ไข',
};

/** Canonical labels, in the order a human reads the workflow. */
export const BRIEFING_STATUSES = [
  BRIEFING_STATUS_PENDING,
  'แก้ไข',
  'กำลังทำ',
  'ส่งตรวจ',
  'รอตรวจ',
  'สั่งแก้ไข',
  'สั่งเพิ่มงาน',
  'รอแก้ไข',
  'ยกเลิกงาน',
  'เสร็จสิ้น',
];

export function normalizeBriefingStatus(status) {
  const value = String(status ?? '').trim();
  if (!value) return BRIEFING_STATUS_PENDING;
  return STATUS_ALIASES[value] || value;
}

const NOT_STARTED = new Set([BRIEFING_STATUS_PENDING, 'แก้ไข']);
const IN_PROGRESS = new Set(['กำลังทำ', 'ส่งตรวจ', 'รอตรวจ', 'สั่งแก้ไข', 'สั่งเพิ่มงาน', 'รอแก้ไข']);

/**
 * Progress bucket shared by the team overview and the personal dashboard, so
 * one briefing can never be "กำลังทำ" on one page and "ยังไม่เริ่ม" on another.
 * Cancelled work belongs to no bucket and returns null.
 */
export function classifyBriefingProgress(status) {
  const value = normalizeBriefingStatus(status);
  if (value === 'เสร็จสิ้น') return 'completed';
  if (NOT_STARTED.has(value)) return 'notStarted';
  if (IN_PROGRESS.has(value)) return 'inProgress';
  return null;
}
