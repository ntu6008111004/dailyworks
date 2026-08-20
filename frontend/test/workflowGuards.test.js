import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canEditBriefingContent,
  canEditBriefingStatus,
  isBriefingAssignee,
  isRecipientOnly,
} from '../src/utils/briefingPermissions.js';
import { applyBriefingRealtimeChange, shouldShowBriefingNotification } from '../src/utils/briefingRealtime.js';
import { getBriefingAwardedPoints, getScoreAdjustmentPreview } from '../src/utils/briefingScore.js';
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

test('mandatory update gate remembers an acknowledged release on this device', () => {
  assert.equal(updateGateDecision({ currentVersion: 200, serverVersion: 200 }), 'none');
  assert.equal(updateGateDecision({ currentVersion: 200, serverVersion: 201 }), 'prompt');
  assert.equal(updateGateDecision({ currentVersion: 200, serverVersion: 201, attemptedVersion: 201 }), 'acknowledged');
  assert.equal(updateGateDecision({ currentVersion: 200, serverVersion: 202, attemptedVersion: 201 }), 'prompt');
});
