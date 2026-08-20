// Keep the original key for backward compatibility with devices that have
// already acknowledged an update before the mandatory-update UI was added.
export const UPDATE_ATTEMPT_KEY = 'attempted_update';

export function updateGateDecision({ currentVersion, serverVersion, attemptedVersion }) {
  const current = Number(currentVersion) || 0;
  const server = Number(serverVersion) || 0;
  if (!current || server <= current) return 'none';
  if (String(attemptedVersion || '') === String(server)) return 'acknowledged';
  return 'prompt';
}
