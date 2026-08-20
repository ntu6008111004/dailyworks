// The briefing list is a work queue, not a feed: what is due soonest has to be
// read first. Creation time only breaks ties between two identical due dates.

const FAR_FUTURE = 8640000000000000;

function dueTime(briefing) {
  const raw = briefing?.DueDate || briefing?.StartDate || '';
  const time = new Date(raw).getTime();
  // A briefing without a usable due date sinks below every scheduled one
  // instead of jumping to the top as an invalid date would.
  return Number.isNaN(time) || !raw ? FAR_FUTURE : time;
}

function createdTime(briefing) {
  const time = new Date(briefing?.CreatedAt || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

// Closed work is reference material, not a queue item: everything still in
// progress outranks it no matter how the deadlines compare.
const FINISHED_STATUSES = new Set(['เสร็จสิ้น', 'เสร็จ', 'ยกเลิกงาน']);

export function isBriefingFinished(briefing) {
  return FINISHED_STATUSES.has(String(briefing?.Status || ''));
}

/**
 * Unfinished work first; within each group the soonest deadline first, and the
 * newest briefing first within the same deadline.
 */
export function compareBriefingsByDueDate(a, b) {
  const finished = Number(isBriefingFinished(a)) - Number(isBriefingFinished(b));
  if (finished !== 0) return finished;
  const difference = dueTime(a) - dueTime(b);
  if (difference !== 0) return difference;
  return createdTime(b) - createdTime(a);
}

export function sortBriefingsByDueDate(briefings = []) {
  return [...(Array.isArray(briefings) ? briefings : [])].sort(compareBriefingsByDueDate);
}

// The review queue triages by urgency: a briefing without a priority sits with
// the Medium ones instead of jumping to either end.
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

function priorityRank(briefing) {
  const rank = PRIORITY_RANK[String(briefing?.Priority || '')];
  return rank === undefined ? PRIORITY_RANK.Medium : rank;
}

/** Most important first, then the soonest deadline, newest first as tiebreak. */
export function compareBriefingsForReview(a, b) {
  const priority = priorityRank(a) - priorityRank(b);
  if (priority !== 0) return priority;
  const difference = dueTime(a) - dueTime(b);
  if (difference !== 0) return difference;
  return createdTime(b) - createdTime(a);
}

export function sortBriefingsForReview(briefings = []) {
  return [...(Array.isArray(briefings) ? briefings : [])].sort(compareBriefingsForReview);
}
