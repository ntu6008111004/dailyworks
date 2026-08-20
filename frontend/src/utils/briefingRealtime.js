export function applyBriefingRealtimeChange(items, detail) {
  const current = Array.isArray(items) ? items : [];
  const briefing = detail?.briefing;
  const id = String(briefing?.ID || '');
  if (!id) return current;

  if (detail?.eventType === 'DELETE') {
    return current.filter((item) => String(item.ID) !== id);
  }

  const index = current.findIndex((item) => String(item.ID) === id);
  if (index < 0) return [briefing, ...current];
  return current.map((item, itemIndex) => itemIndex === index ? { ...item, ...briefing } : item);
}

export function shouldShowBriefingNotification({ lastUpdatedBy, userId }) {
  return String(lastUpdatedBy || '') !== String(userId || '');
}
