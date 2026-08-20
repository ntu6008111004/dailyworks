import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canEditBriefingContent,
  canEditBriefingStatus,
  isBriefingAssignee,
  isRecipientOnly,
} from '../src/utils/briefingPermissions.js';
import { applyBriefingRealtimeChange, shouldShowBriefingNotification } from '../src/utils/briefingRealtime.js';
import { formatBriefingPoints, getBonusLevelDetails, getBriefingAwardedPoints, getScoreAdjustmentPreview } from '../src/utils/briefingScore.js';
import { getLatePenaltyPoints, getNetTeamPoints, summarizePointLedger, toBangkokDateKey } from '../src/utils/briefingPointLedger.js';
import { normalizeExternalLink } from '../src/utils/externalLinks.js';
import { updateGateDecision } from '../src/utils/updateGate.js';

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
