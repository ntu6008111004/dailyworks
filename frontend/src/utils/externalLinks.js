export function normalizeExternalLink(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  if (/^[a-z][a-z\d+.-]*:/i.test(rawValue) && !/^https?:\/\//i.test(rawValue)) return '';

  const candidate = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}
