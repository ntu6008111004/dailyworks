import { toBangkokDateKey } from './briefingPointLedger.js';
import { normalizeBriefingStatus } from './briefingStatus.js';

// The head's "who did what today" panel on the review page. One row per
// person for a Bangkok date: briefs they created, work they received, every
// time they pressed ส่งตรวจ (with the time), and how much is still in hand.
//
// "Received" means the briefing was created that day with them assigned, or
// they claimed an unassigned brief that day (CLAIMED in the review history).
// A claimed brief counts only on its claim day. Someone added later by an
// edit still counts on the briefing's creation day: the schema has no
// per-assignee timestamp for that.

const toIdList = (value) => {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const FINISHED = new Set(['เสร็จสิ้น', 'ยกเลิกงาน']);

export function formatBangkokTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export function formatBangkokDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

/** Latest SUBMITTED event of one person on one briefing, or null. */
export function getLatestSubmission(history, userId) {
  return (Array.isArray(history) ? history : [])
    .filter((event) => event?.Action === 'SUBMITTED' && toIdList(event.TargetUserIDs).includes(String(userId)))
    .sort((left, right) => String(right.CreatedAt).localeCompare(String(left.CreatedAt)))[0] || null;
}

export function summarizeBriefingDay({ briefings = [], submissions = [], claims = [], dateKey, userIds = null }) {
  const rows = new Map();
  const allowed = userIds ? new Set(userIds.map(String)) : null;
  const rowFor = (id) => {
    const key = String(id || '');
    if (!key || (allowed && !allowed.has(key))) return null;
    if (!rows.has(key)) rows.set(key, { userId: key, created: [], received: [], claimed: 0, submissions: [], openInHand: 0 });
    return rows.get(key);
  };
  const byId = new Map((Array.isArray(briefings) ? briefings : []).map((briefing) => [String(briefing.ID), briefing]));
  const claimList = Array.isArray(claims) ? claims : [];
  const claimedPairs = new Set(claimList.flatMap((event) => toIdList(event.TargetUserIDs)
    .map((id) => `${event.BriefingID}:${id}`)));

  byId.forEach((briefing) => {
    const createdToday = toBangkokDateKey(briefing.CreatedAt) === dateKey;
    const assignees = toIdList(briefing.Assignees);
    if (createdToday) rowFor(briefing.CreatorID)?.created.push(briefing);
    const open = !FINISHED.has(normalizeBriefingStatus(briefing.Status));
    assignees.filter((id, index, list) => list.indexOf(id) === index).forEach((id) => {
      const row = rowFor(id);
      if (!row) return;
      if (createdToday && !claimedPairs.has(`${briefing.ID}:${id}`)) row.received.push(briefing);
      if (open) row.openInHand += 1;
    });
  });

  claimList.forEach((event) => {
    if (toBangkokDateKey(event.CreatedAt) !== dateKey) return;
    const briefing = byId.get(String(event.BriefingID));
    if (!briefing) return;
    toIdList(event.TargetUserIDs).forEach((id) => {
      const row = rowFor(id);
      if (!row) return;
      row.received.push(briefing);
      row.claimed += 1;
    });
  });

  (Array.isArray(submissions) ? submissions : []).forEach((event) => {
    if (toBangkokDateKey(event.CreatedAt) !== dateKey) return;
    const briefing = byId.get(String(event.BriefingID));
    if (!briefing) return;
    const submitters = toIdList(event.TargetUserIDs);
    (submitters.length ? submitters : [String(event.ReviewerID || '')]).forEach((id) => {
      rowFor(id)?.submissions.push({ briefing, at: event.CreatedAt });
    });
  });

  return [...rows.values()]
    .filter((row) => row.created.length || row.received.length || row.submissions.length)
    .map((row) => ({ ...row, submissions: row.submissions.sort((left, right) => String(left.at).localeCompare(String(right.at))) }))
    .sort((left, right) => (right.submissions.length - left.submissions.length)
      || (right.received.length - left.received.length)
      || (right.created.length - left.created.length));
}
