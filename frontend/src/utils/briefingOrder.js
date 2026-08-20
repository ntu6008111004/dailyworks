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

/** Soonest deadline first, newest briefing first within the same deadline. */
export function compareBriefingsByDueDate(a, b) {
  const difference = dueTime(a) - dueTime(b);
  if (difference !== 0) return difference;
  return createdTime(b) - createdTime(a);
}

export function sortBriefingsByDueDate(briefings = []) {
  return [...(Array.isArray(briefings) ? briefings : [])].sort(compareBriefingsByDueDate);
}
