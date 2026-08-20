import { getMemberBriefingAward, isBriefingEarnedByMember } from './briefingScore.js';
import { getNetTeamPoints, summarizePointLedger, toBangkokDateKey } from './briefingPointLedger.js';

// One rulebook for "how many points does this person have" — the team overview
// and the personal dashboard both call computeMemberScore(), so the same
// briefing can never show two different totals on two pages.

/**
 * The date that anchors a briefing in a reporting range: completed work counts
 * on the day it was closed, active work on the day it started.
 */
export function isBriefingInMemberRange(briefing, startDate, endDate) {
  const dateStr = briefing?.Status === 'เสร็จสิ้น'
    ? (briefing.CompletedAt || briefing.UpdatedAt || briefing.CreatedAt)
    : (briefing?.StartDate || briefing?.CreatedAt);
  if (!dateStr) return true;
  const targetDate = String(dateStr).slice(0, 10);
  if (startDate && targetDate < startDate) return false;
  if (endDate && targetDate > endDate) return false;
  return true;
}

/** Ledger rows for one person, grouped into the range by Bangkok date. */
export function filterMemberLedger(ledger, memberId, startDate, endDate) {
  const id = String(memberId || '');
  return (Array.isArray(ledger) ? ledger : []).filter((entry) => {
    if (String(entry?.UserID) !== id) return false;
    const entryDate = toBangkokDateKey(entry.CreatedAt);
    if (startDate && entryDate < startDate) return false;
    if (endDate && entryDate > endDate) return false;
    return true;
  });
}

export function computeMemberScore({ briefings = [], responses = [], ledger = [], memberId, startDate = '', endDate = '' }) {
  const id = String(memberId || '');
  let totalPoints = 0;
  let specialPoints = 0;

  (Array.isArray(briefings) ? briefings : []).forEach((briefing) => {
    const isCreator = String(briefing?.CreatorID) === id;
    const isAssignee = Array.isArray(briefing?.Assignees) && briefing.Assignees.some((item) => String(item) === id);
    if (!isCreator && !isAssignee) return;
    if (!isBriefingInMemberRange(briefing, startDate, endDate)) return;

    const response = (Array.isArray(responses) ? responses : [])
      .find((item) => String(item?.BriefingID) === String(briefing.ID) && String(item?.UserID) === id);
    let memberStatus = response?.Status || 'รอดำเนินการ';
    if (briefing.Status === 'เสร็จสิ้น') memberStatus = 'เสร็จสิ้น';

    if (isBriefingEarnedByMember(briefing, { isCreator, isAssignee, memberStatus })) {
      totalPoints += getMemberBriefingAward(briefing, { isCreator, isAssignee, memberStatus });
      specialPoints += Math.max(0, Number(briefing.BonusPoints) || 0);
    }
  });

  const ledgerEntries = filterMemberLedger(ledger, id, startDate, endDate);
  return {
    totalPoints,
    specialPoints,
    ledgerEntries,
    deductionSummary: summarizePointLedger(ledgerEntries),
    netPoints: getNetTeamPoints(totalPoints, ledgerEntries),
  };
}
