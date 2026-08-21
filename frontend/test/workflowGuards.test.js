import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canEditBriefingContent,
  canEditBriefingStatus,
  isBriefingAssignee,
  isRecipientOnly,
} from '../src/utils/briefingPermissions.js';
import { applyBriefingRealtimeChange, shouldShowBriefingNotification } from '../src/utils/briefingRealtime.js';
import { formatBriefingPoints, getBonusLevelDetails, getBriefingAwardedPoints, BRIEFING_POINT_CHOICES, getBriefingPointOptions, getBriefingPointsError, getMemberBriefingAward, getScoreAdjustmentPreview, isBriefingEarnedByMember, isBriefingScoreLocked } from '../src/utils/briefingScore.js';
import { getBangkokMonthRange, getBriefingReviewParticipants, getLatePenaltyPoints, getNetTeamPoints, getOverdueDays, summarizePointLedger, toBangkokDateKey } from '../src/utils/briefingPointLedger.js';
import { normalizeExternalLink } from '../src/utils/externalLinks.js';
import { updateGateDecision } from '../src/utils/updateGate.js';
import { describeReviewAmount, getLatestReviewInstruction, requiresReviewComment, REVIEW_ACTION_LABELS, summarizeReviewNotes } from '../src/utils/briefingReviewNotes.js';
import { briefingSelectAt, BRIEFING_SELECT_LADDER, BRIEFING_SELECT_RETRY_MS, isMissingSchemaField, nextBriefingSelectIndex, readBriefingSelectIndex, rememberBriefingSelectIndex } from '../src/utils/briefingSchema.js';
import { describeReviewError, isOutdatedReviewFunction } from '../src/utils/briefingReviewErrors.js';
import { compareBriefingsByDueDate, compareBriefingsForReview, isBriefingFinished, sortBriefingsByDueDate, sortBriefingsForReview } from '../src/utils/briefingOrder.js';
import { computeMemberScore, filterMemberLedger, isBriefingInMemberRange } from '../src/utils/briefingMemberScore.js';

test('recipient cannot alter the assigning brief, including a JSON-assignee record', () => {
  const briefing = { CreatorID: 'creator', Assignees: '["recipient", "other"]' };
  assert.equal(isBriefingAssignee(briefing, 'recipient'), true);
  assert.equal(isRecipientOnly(briefing, 'recipient'), true);
  assert.equal(canEditBriefingContent({ briefing, userId: 'recipient', isAdmin: true, isDepartmentHead: true }), false);
  assert.equal(canEditBriefingStatus({ briefing, userId: 'recipient', isAdmin: true }), false);
});

test('creator and non-recipient head retain their intended controls', () => {
  const briefing = { CreatorID: 'creator', Assignees: ['recipient'] };
  assert.equal(canEditBriefingContent({ briefing, userId: 'creator', isAdmin: false, isDepartmentHead: false }), true);
  assert.equal(canEditBriefingStatus({ briefing, userId: 'creator', isAdmin: false }), true);
  assert.equal(canEditBriefingContent({ briefing, userId: 'head', isAdmin: false, isDepartmentHead: true }), true);
  assert.equal(canEditBriefingStatus({ briefing, userId: 'head', isAdmin: false }), false);
  assert.equal(canEditBriefingContent({ briefing: null, userId: 'creator', isAdmin: false, isDepartmentHead: false }), true);
  assert.equal(canEditBriefingStatus({ briefing: null, userId: 'creator', isAdmin: false }), false);
});

test('recipient controls win even when the assignee is also the creator, admin, or head', () => {
  const selfAssigned = { CreatorID: 'same-user', Assignees: ['same-user'] };
  assert.equal(isRecipientOnly(selfAssigned, 'same-user'), true);
  assert.equal(canEditBriefingContent({ briefing: selfAssigned, userId: 'same-user', isAdmin: true, isDepartmentHead: true }), false);
  assert.equal(canEditBriefingStatus({ briefing: selfAssigned, userId: 'same-user', isAdmin: true }), false);
});

test('realtime changes patch every open tab, while own changes suppress only notifications', () => {
  const initial = [{ ID: 'brief-1', Status: 'ดำเนินการ', Title: 'เดิม' }];
  const updated = applyBriefingRealtimeChange(initial, {
    eventType: 'UPDATE',
    briefing: { ID: 'brief-1', Status: 'ส่งตรวจ', UpdatedAt: '2026-08-20T10:00:00Z' },
  });
  assert.equal(updated[0].Status, 'ส่งตรวจ');
  assert.equal(updated[0].Title, 'เดิม');
  assert.deepEqual(applyBriefingRealtimeChange(updated, { eventType: 'DELETE', briefing: { ID: 'brief-1' } }), []);
  assert.equal(shouldShowBriefingNotification({ lastUpdatedBy: 'same-user', userId: 'same-user' }), false);
  assert.equal(shouldShowBriefingNotification({ lastUpdatedBy: 'creator', userId: 'recipient' }), true);
});

test('score adjustment calculates only the difference from the already-awarded amount', () => {
  const completed = { Points: 4, FinalPoints: 4, BonusPoints: 0, ScoreAdjustment: 0 };
  const first = getScoreAdjustmentPreview(completed, 5);
  assert.deepEqual(first, { currentPoints: 4, targetPoints: 5, delta: 1, scoreAdjustment: 1 });
  const afterFirst = { ...completed, ScoreAdjustment: first.scoreAdjustment };
  assert.equal(getBriefingAwardedPoints(afterFirst), 5);
  const repeated = getScoreAdjustmentPreview(afterFirst, 5);
  assert.deepEqual(repeated, { currentPoints: 5, targetPoints: 5, delta: 0, scoreAdjustment: 1 });
  assert.equal(getBriefingAwardedPoints({ Points: 6, DeductedPoints: 2, BonusPoints: 2, ScoreAdjustment: -1 }), 5);
});

test('special score levels use the remaining score and preserve half points', () => {
  assert.deepEqual(getBonusLevelDetails('standard', 5), {
    value: 'standard', label: 'มาตรฐาน ×1', multiplier: 1, flatBonus: 0,
    basePoints: 5, bonusPoints: 0, totalPoints: 5,
  });
  assert.equal(getBonusLevelDetails('good', 5).bonusPoints, 2.5);
  assert.equal(getBonusLevelDetails('good', 5).totalPoints, 7.5);
  assert.equal(getBonusLevelDetails('excellent', 4).totalPoints, 8);
  assert.equal(getBonusLevelDetails('viral', 4).bonusPoints, 30);
  assert.equal(getBonusLevelDetails('viral', 4).totalPoints, 34);
  assert.equal(getBriefingAwardedPoints({ FinalPoints: 5, BonusPoints: 2.5 }), 7.5);
  assert.equal(formatBriefingPoints(7.5), '7.5');
});

test('mandatory update gate remembers an acknowledged release on this device', () => {
  assert.equal(updateGateDecision({ currentVersion: 200, serverVersion: 200 }), 'none');
  assert.equal(updateGateDecision({ currentVersion: 200, serverVersion: 201 }), 'prompt');
  assert.equal(updateGateDecision({ currentVersion: 200, serverVersion: 201, attemptedVersion: 201 }), 'acknowledged');
  assert.equal(updateGateDecision({ currentVersion: 200, serverVersion: 202, attemptedVersion: 201 }), 'prompt');
});

test('reference links open only safe external web URLs', () => {
  assert.equal(normalizeExternalLink('https://docs.google.com/document/d/123'), 'https://docs.google.com/document/d/123');
  assert.equal(normalizeExternalLink('docs.google.com/document/d/123'), 'https://docs.google.com/document/d/123');
  assert.equal(normalizeExternalLink(' javascript:alert(1) '), '');
  assert.equal(normalizeExternalLink('ftp://example.com/file'), '');
  assert.equal(normalizeExternalLink('not a valid link'), '');
  assert.equal(normalizeExternalLink(''), '');
});

test('lateness penalties use capped tiers and monthly deductions never make net points negative', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 6, 7, 99].map(getLatePenaltyPoints), [0, 1, 4, 4, 8, 8, 8, 8]);
  const ledger = [
    { EntryType: 'LATE_PENALTY', Points: 8 },
    { EntryType: 'LATE_REFUND', Points: 4 },
    { EntryType: 'ERROR_PENALTY', Points: 5 },
    { EntryType: 'SEVERE_ERROR_PENALTY', Points: 50 },
  ];
  assert.deepEqual(summarizePointLedger(ledger), {
    latePenalty: 8,
    errorPenalty: 5,
    severePenalty: 50,
    refunded: 4,
    deducted: 63,
    netDeduction: 59,
  });
  assert.equal(getNetTeamPoints(100, ledger), 41);
  assert.equal(getNetTeamPoints(10, ledger), 0);
});

test('monthly ledger dates are grouped by Bangkok date instead of UTC date', () => {
  assert.equal(toBangkokDateKey('2026-08-20T18:30:00.000Z'), '2026-08-21');
  assert.equal(toBangkokDateKey('invalid-date'), '');
});

test('monthly error deductions can target both creator and assignees without duplicates', () => {
  const users = [
    { ID: 'creator', Name: 'Creator' },
    { ID: 'recipient', Name: 'Recipient' },
  ];
  assert.deepEqual(
    getBriefingReviewParticipants({ CreatorID: 'creator', Assignees: '["creator","recipient"]' }, users),
    [
      { id: 'creator', person: users[0], roleLabel: 'ผู้บรีฟงาน' },
      { id: 'recipient', person: users[1], roleLabel: 'ผู้รับงาน' },
    ],
  );
});

test('a head instruction reaches the briefing page with its mandatory note', () => {
  const users = [{ ID: 'head-1', Name: 'หัวหน้ากราฟิก' }];
  const history = [
    { ID: 1, Action: 'NEEDS_REVISION', Comment: 'แก้สีโลโก้', PointsDeducted: 1, ReviewerID: 'head-1', CreatedAt: '2026-08-19T03:00:00.000Z' },
    { ID: 2, Action: 'EXTRA_WORK', Comment: 'ทำแบนเนอร์เพิ่ม 2 ชิ้น', ExtraPoints: 3, ReviewerID: 'head-1', CreatedAt: '2026-08-20T03:00:00.000Z' },
    { ID: 3, Action: 'DEADLINE_EXTENDED', Comment: 'รอไฟล์ลูกค้า', ExtensionDays: 2, NewDueDate: '2026-08-24', ReviewerID: 'head-1', CreatedAt: '2026-08-20T02:00:00.000Z' },
    { ID: 4, Action: 'BONUS_UPDATED', Comment: '', BonusLevel: 'good', ReviewerID: 'head-1', CreatedAt: '2026-08-20T04:00:00.000Z' },
  ];

  const notes = summarizeReviewNotes(history, users);
  assert.deepEqual(notes.map((note) => note.action), ['EXTRA_WORK', 'DEADLINE_EXTENDED', 'NEEDS_REVISION']);
  assert.equal(notes[0].label, 'สั่งงานเพิ่ม');
  assert.equal(notes[0].amount, 'เพิ่มคะแนนงาน +3');
  assert.equal(notes[0].comment, 'ทำแบนเนอร์เพิ่ม 2 ชิ้น');
  assert.equal(notes[0].reviewer, 'หัวหน้ากราฟิก');
  assert.equal(notes[1].amount, 'ขยาย 2 วัน ถึง 2026-08-24');
  assert.equal(notes[2].amount, 'หักคะแนนงาน 1');
  assert.equal(getLatestReviewInstruction(history, users).action, 'EXTRA_WORK');
  assert.equal(getLatestReviewInstruction([]), null);
  assert.equal(describeReviewAmount({ Action: 'APPROVED' }), '');
  assert.equal(summarizeReviewNotes(null)[0], undefined);
  assert.equal(summarizeReviewNotes([{ ID: 9, Action: 'REJECTED', ReviewerID: 'ghost' }])[0].reviewer, 'หัวหน้าแผนก');
  assert.equal(REVIEW_ACTION_LABELS.SEVERE_ERROR, 'ความผิดพลาดร้ายแรง');
});

test('every corrective review action forces a note, approval stays optional', () => {
  ['needs_revision', 'rejected', 'severe_error', 'extra_work', 'extend_deadline'].forEach((action) => {
    assert.equal(requiresReviewComment(action), true, action);
  });
  assert.equal(requiresReviewComment('approved'), false);
  assert.equal(requiresReviewComment('bonus'), false);
  assert.equal(requiresReviewComment(null), false);
});

test('the briefing select degrades newest column first and remembers the working level', () => {
  assert.match(briefingSelectAt(0), /ScoreAdjustment/);
  assert.match(briefingSelectAt(1), /BonusLevel/);
  assert.doesNotMatch(briefingSelectAt(1), /ScoreAdjustment/);
  assert.doesNotMatch(briefingSelectAt(2), /BonusLevel/);
  assert.doesNotMatch(briefingSelectAt(3), /LatePenaltyEnabled/);
  assert.equal(briefingSelectAt(99), BRIEFING_SELECT_LADDER.at(-1));
  assert.equal(nextBriefingSelectIndex(0), 1);
  assert.equal(nextBriefingSelectIndex(BRIEFING_SELECT_LADDER.length - 1), -1);

  assert.equal(isMissingSchemaField({ code: '42703', message: 'column Briefings.ScoreAdjustment does not exist' }), true);
  assert.equal(isMissingSchemaField({ message: 'Could not find BonusLevel in the schema cache' }), true);
  assert.equal(isMissingSchemaField({ code: '401', message: 'JWT expired' }), false);
  assert.equal(isMissingSchemaField(null), false);

  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  assert.equal(readBriefingSelectIndex(storage), 0);
  rememberBriefingSelectIndex(1, storage);
  assert.equal(readBriefingSelectIndex(storage), 1);
  rememberBriefingSelectIndex(0, storage);
  assert.equal(readBriefingSelectIndex(storage), 1, 'level 0 is the default, never worth storing');

  // A narrowed level expires: after the retry window the full select is probed
  // again, so a finished migration stops hiding new columns from the lists.
  rememberBriefingSelectIndex(2, storage, 1_000);
  assert.equal(readBriefingSelectIndex(storage, 2_000), 2);
  assert.equal(readBriefingSelectIndex(storage, 1_000 + BRIEFING_SELECT_RETRY_MS + 1), 0);

  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readBriefingSelectIndex(blocked), 0);
  rememberBriefingSelectIndex(2, blocked);
  assert.equal(readBriefingSelectIndex(undefined), 0);
});

test('a review rejected by the database is explained in Thai instead of a bare 400', () => {
  assert.equal(
    describeReviewError({ code: 'P0001', message: 'A selected user is not a participant in this briefing' }),
    'มีผู้ที่เลือกไว้ไม่ได้เกี่ยวข้องกับงานนี้ กรุณาเลือกเฉพาะผู้บรีฟงานหรือผู้รับงาน',
  );
  assert.equal(
    describeReviewError({ code: 'P0001', message: 'A comment is required for this review action' }),
    'กรุณาระบุหมายเหตุหรือเหตุผลก่อนส่งคำสั่งนี้',
  );
  assert.match(
    describeReviewError({ code: 'PGRST202', message: 'Could not find the function public.review_briefing(p_target_user_ids)' }),
    /migration 20260820_briefing_monthly_penalties\.sql/,
  );
  assert.equal(isOutdatedReviewFunction({ message: 'function public.review_briefing does not exist' }), true);
  assert.equal(isOutdatedReviewFunction({ code: 'P0001', message: 'Briefing not found' }), false);
  assert.equal(isOutdatedReviewFunction(null), false);
  assert.equal(describeReviewError({ message: 'network unreachable' }), 'network unreachable');
  assert.equal(describeReviewError(null), 'ตรวจงานไม่สำเร็จ');
  assert.equal(describeReviewError({}), 'ตรวจงานไม่สำเร็จ');
});

test('the briefing queue is ordered by deadline, undated work last', () => {
  const ordered = sortBriefingsByDueDate([
    { ID: 'later', DueDate: '2026-09-01', CreatedAt: '2026-08-01T00:00:00.000Z' },
    { ID: 'undated', DueDate: '', CreatedAt: '2026-08-19T00:00:00.000Z' },
    { ID: 'due-soon-old', DueDate: '2026-08-21', CreatedAt: '2026-08-02T00:00:00.000Z' },
    { ID: 'due-soon-new', DueDate: '2026-08-21', CreatedAt: '2026-08-18T00:00:00.000Z' },
    { ID: 'start-only', StartDate: '2026-08-20', CreatedAt: '2026-08-03T00:00:00.000Z' },
    { ID: 'broken-date', DueDate: 'unknown', CreatedAt: '2026-08-04T00:00:00.000Z' },
  ]);
  assert.deepEqual(ordered.map((item) => item.ID), ['start-only', 'due-soon-new', 'due-soon-old', 'later', 'undated', 'broken-date']);
  assert.equal(compareBriefingsByDueDate({ DueDate: '2026-08-21' }, { DueDate: '2026-08-21' }), 0);
  assert.deepEqual(sortBriefingsByDueDate(), []);
  assert.deepEqual(sortBriefingsByDueDate(null), []);
});

test('a briefing score is paid per person, not divided between briefer and recipients', () => {
  // 5 points, approved, nothing deducted: everyone involved earns the same 5.
  const approved = { Status: 'เสร็จสิ้น', Points: 5, DeductedPoints: 0, FinalPoints: 5, BonusPoints: 0 };
  const briefer = { isCreator: true, isAssignee: false, memberStatus: 'เสร็จสิ้น' };
  const firstRecipient = { isCreator: false, isAssignee: true, memberStatus: 'เสร็จสิ้น' };
  const secondRecipient = { isCreator: false, isAssignee: true, memberStatus: 'เสร็จสิ้น' };
  assert.equal(getMemberBriefingAward(approved, briefer), 5);
  assert.equal(getMemberBriefingAward(approved, firstRecipient), 5);
  assert.equal(getMemberBriefingAward(approved, secondRecipient), 5);

  // Someone who briefed the work and also received it is still paid once.
  assert.equal(getMemberBriefingAward(approved, { isCreator: true, isAssignee: true, memberStatus: 'เสร็จสิ้น' }), 5);

  // A Task deduction lowers every share by the same amount, never one side only.
  const corrected = { Status: 'เสร็จสิ้น', Points: 5, DeductedPoints: 1, FinalPoints: 4, BonusPoints: 0 };
  assert.equal(getMemberBriefingAward(corrected, briefer), 4);
  assert.equal(getMemberBriefingAward(corrected, firstRecipient), 4);

  // Extra work raises the shared Task score, so both sides gain it together.
  const withExtraWork = { Status: 'เสร็จสิ้น', Points: 8, DeductedPoints: 0, FinalPoints: 8, BonusPoints: 4 };
  assert.equal(getMemberBriefingAward(withExtraWork, briefer), 12);
  assert.equal(getMemberBriefingAward(withExtraWork, firstRecipient), 12);

  // Nothing is earned before approval, and an outsider never earns anything.
  const waiting = { Status: 'ส่งตรวจ', Points: 5, DeductedPoints: 0, BonusPoints: 0 };
  assert.equal(getMemberBriefingAward(waiting, briefer), 0);
  assert.equal(isBriefingEarnedByMember(waiting, briefer), false);
  assert.equal(isBriefingEarnedByMember(waiting, { isCreator: false, isAssignee: true, memberStatus: 'เสร็จสิ้น' }), true);
  assert.equal(isBriefingEarnedByMember(approved, { isCreator: false, isAssignee: false }), false);
  assert.equal(isBriefingEarnedByMember(approved), false);
  assert.equal(getMemberBriefingAward(approved, { isCreator: false, isAssignee: false }), 0);
});

test('the briefing and team views pin their date filter to the Bangkok month', () => {
  // 18:30 UTC is already the 21st in Bangkok, so the range is that month.
  assert.deepEqual(getBangkokMonthRange('2026-08-20T18:30:00.000Z'), { start: '2026-08-01', end: '2026-08-31' });
  assert.deepEqual(getBangkokMonthRange('2024-02-05T00:00:00.000Z'), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(getBangkokMonthRange('2026-12-31T17:30:00.000Z'), { start: '2027-01-01', end: '2027-01-31' });
  assert.deepEqual(getBangkokMonthRange('invalid'), { start: '', end: '' });
});

test('a briefing cannot be saved by its creator without a positive score', () => {
  assert.notEqual(getBriefingPointsError(0), '');
  assert.notEqual(getBriefingPointsError(''), '');
  assert.notEqual(getBriefingPointsError(-3), '');
  assert.notEqual(getBriefingPointsError('abc'), '');
  assert.notEqual(getBriefingPointsError(null), '');
  assert.equal(getBriefingPointsError(0.5), '');
  assert.equal(getBriefingPointsError(5), '');
  assert.equal(getBriefingPointsError('8'), '');
});

test('unfinished briefings outrank closed work regardless of deadline', () => {
  const ordered = sortBriefingsByDueDate([
    { ID: 'done-early', Status: 'เสร็จสิ้น', DueDate: '2026-08-01', CreatedAt: '2026-08-01T00:00:00.000Z' },
    { ID: 'active-late', Status: 'ดำเนินการ', DueDate: '2026-09-15', CreatedAt: '2026-08-02T00:00:00.000Z' },
    { ID: 'cancelled', Status: 'ยกเลิกงาน', DueDate: '2026-08-02', CreatedAt: '2026-08-03T00:00:00.000Z' },
    { ID: 'waiting-review', Status: 'ส่งตรวจ', DueDate: '2026-08-25', CreatedAt: '2026-08-04T00:00:00.000Z' },
  ]);
  assert.deepEqual(ordered.map((item) => item.ID), ['waiting-review', 'active-late', 'done-early', 'cancelled']);
  assert.equal(isBriefingFinished({ Status: 'เสร็จสิ้น' }), true);
  assert.equal(isBriefingFinished({ Status: 'เสร็จ' }), true);
  assert.equal(isBriefingFinished({ Status: 'รอตรวจ' }), false);
  assert.equal(isBriefingFinished(null), false);
});

test('the dashboard and team overview share one member score rulebook', () => {
  const briefings = [
    // Approved 5-point briefing completed this month: briefer and recipient both earn 5.
    { ID: 'b1', Status: 'เสร็จสิ้น', CreatorID: 'boss', Assignees: ['worker'], Points: 5, FinalPoints: 5, BonusPoints: 0, CompletedAt: '2026-08-10T04:00:00.000Z' },
    // Waiting review: nobody is paid yet.
    { ID: 'b2', Status: 'ส่งตรวจ', CreatorID: 'boss', Assignees: ['worker'], Points: 3, StartDate: '2026-08-05' },
    // Completed outside the range: excluded.
    { ID: 'b3', Status: 'เสร็จสิ้น', CreatorID: 'boss', Assignees: ['worker'], Points: 9, FinalPoints: 9, BonusPoints: 0, CompletedAt: '2026-07-20T04:00:00.000Z' },
  ];
  const ledger = [
    { UserID: 'worker', EntryType: 'LATE_PENALTY', Points: 4, CreatedAt: '2026-08-11T04:00:00.000Z' },
    { UserID: 'worker', EntryType: 'LATE_REFUND', Points: 3, CreatedAt: '2026-08-12T04:00:00.000Z' },
    { UserID: 'worker', EntryType: 'ERROR_PENALTY', Points: 5, CreatedAt: '2026-07-01T04:00:00.000Z' },
    { UserID: 'boss', EntryType: 'SEVERE_ERROR_PENALTY', Points: 50, CreatedAt: '2026-08-13T04:00:00.000Z' },
  ];
  const range = { startDate: '2026-08-01', endDate: '2026-08-31' };

  const worker = computeMemberScore({ briefings, responses: [], ledger, memberId: 'worker', ...range });
  assert.equal(worker.totalPoints, 5);
  assert.equal(worker.deductionSummary.netDeduction, 1, 'July penalty stays out of the August window');
  assert.equal(worker.netPoints, 4);
  assert.equal(worker.ledgerEntries.length, 2);

  const boss = computeMemberScore({ briefings, responses: [], ledger, memberId: 'boss', ...range });
  assert.equal(boss.totalPoints, 5, 'the briefer earns the same 5, not a split share');
  assert.equal(boss.netPoints, 0, 'net points never go below zero');

  const outsider = computeMemberScore({ briefings, responses: [], ledger, memberId: 'ghost', ...range });
  assert.deepEqual([outsider.totalPoints, outsider.netPoints], [0, 0]);

  // A recipient whose own delivery is complete earns before the whole briefing closes.
  const partial = computeMemberScore({
    briefings: [{ ID: 'b4', Status: 'รอตรวจ', CreatorID: 'boss', Assignees: ['worker'], Points: 2, StartDate: '2026-08-06' }],
    responses: [{ BriefingID: 'b4', UserID: 'worker', Status: 'เสร็จสิ้น' }],
    ledger: [],
    memberId: 'worker', ...range,
  });
  assert.equal(partial.totalPoints, 2);

  assert.equal(isBriefingInMemberRange({ Status: 'ดำเนินการ', StartDate: '2026-08-05' }, '2026-08-01', '2026-08-31'), true);
  assert.equal(isBriefingInMemberRange({ Status: 'เสร็จสิ้น', CompletedAt: '2026-07-20T04:00:00.000Z' }, '2026-08-01', '2026-08-31'), false);
  assert.equal(isBriefingInMemberRange({ Status: 'ดำเนินการ' }, '2026-08-01', '2026-08-31'), true, 'undated work stays visible');
  assert.equal(filterMemberLedger(null, 'worker', '', '').length, 0);
});

test('the briefing score dropdown offers 1/4/8 and keeps a legacy value editable', () => {
  assert.deepEqual(BRIEFING_POINT_CHOICES, [1, 4, 8]);
  assert.deepEqual(getBriefingPointOptions(0).map((option) => option.value), ['1', '4', '8']);
  assert.deepEqual(getBriefingPointOptions(4).map((option) => option.value), ['1', '4', '8'], 'a rate-card value adds no duplicate');
  // A legacy or extra-work total outside the rate card stays selectable, so
  // editing an old briefing never silently rewrites its score.
  assert.deepEqual(getBriefingPointOptions(7).map((option) => option.value), ['7', '1', '4', '8']);
  assert.match(getBriefingPointOptions(7)[0].label, /ค่าเดิม/);
  assert.deepEqual(getBriefingPointOptions(2.5).map((option) => option.value), ['2.5', '1', '4', '8']);
  assert.deepEqual(getBriefingPointOptions('abc').map((option) => option.value), ['1', '4', '8']);
});

test('the briefing score is locked only after the head approves the work', () => {
  assert.equal(isBriefingScoreLocked('เสร็จสิ้น'), true, 'อนุมัติแล้วคะแนนล็อก');
  ['ส่งตรวจ', 'ดำเนินการ', 'กำลังทำ', 'รอตรวจ', 'สั่งแก้ไข', 'สั่งเพิ่มงาน', 'ยกเลิกงาน', '', undefined].forEach((status) => {
    assert.equal(isBriefingScoreLocked(status), false, String(status));
  });
});

test('the review queue triages by priority first, then the nearest deadline', () => {
  const ordered = sortBriefingsForReview([
    { ID: 'low-soon', Priority: 'Low', DueDate: '2026-08-21', CreatedAt: '2026-08-01T00:00:00.000Z' },
    { ID: 'high-late', Priority: 'High', DueDate: '2026-09-10', CreatedAt: '2026-08-02T00:00:00.000Z' },
    { ID: 'high-soon', Priority: 'High', DueDate: '2026-08-22', CreatedAt: '2026-08-03T00:00:00.000Z' },
    { ID: 'no-priority', DueDate: '2026-08-20', CreatedAt: '2026-08-04T00:00:00.000Z' },
    { ID: 'medium-soon', Priority: 'Medium', DueDate: '2026-08-25', CreatedAt: '2026-08-05T00:00:00.000Z' },
  ]);
  assert.deepEqual(ordered.map((item) => item.ID), ['high-soon', 'high-late', 'no-priority', 'medium-soon', 'low-soon']);
  assert.equal(compareBriefingsForReview({ Priority: 'High', DueDate: '2026-08-21' }, { Priority: 'High', DueDate: '2026-08-21' }), 0);
  assert.deepEqual(sortBriefingsForReview(null), []);
});

test('the extension field is prefilled with the days the work is overdue in Bangkok', () => {
  // 2026-08-20 17:30 UTC is already 2026-08-21 00:30 in Bangkok.
  const now = new Date('2026-08-20T17:30:00.000Z').getTime();
  assert.equal(getOverdueDays('2026-08-18', now), 3);
  assert.equal(getOverdueDays('2026-08-20', now), 1);
  assert.equal(getOverdueDays('2026-08-21', now), 0, 'due today is not overdue');
  assert.equal(getOverdueDays('2026-08-25', now), 0, 'future due dates stay at zero');
  assert.equal(getOverdueDays('', now), 0);
  assert.equal(getOverdueDays(null, now), 0);
  assert.equal(getOverdueDays('2026-07-01', now), 51, 'long overdue counts every day');
});
