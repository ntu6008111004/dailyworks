function toIdList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function isBriefingCreator(briefing, userId) {
  return Boolean(briefing) && String(briefing.CreatorID) === String(userId);
}

export function isBriefingAssignee(briefing, userId) {
  return toIdList(briefing?.Assignees).some((id) => String(id) === String(userId));
}

export function isRecipientOnly(briefing, userId) {
  // Recipient controls always win for a briefing in which the current user is
  // assigned. This also covers self-assigned creators and assigned admins/heads:
  // on the received-work side they may edit only their own delivery response.
  return Boolean(briefing) && isBriefingAssignee(briefing, userId);
}

export function canEditBriefingStatus({ briefing, userId, isAdmin }) {
  if (!briefing) return false;
  return !isRecipientOnly(briefing, userId) && (Boolean(isAdmin) || isBriefingCreator(briefing, userId));
}

export function canEditBriefingContent({ briefing, userId, isAdmin, isDepartmentHead }) {
  if (!briefing) return true;
  return !isRecipientOnly(briefing, userId)
    && (Boolean(isAdmin) || Boolean(isDepartmentHead) || isBriefingCreator(briefing, userId));
}
