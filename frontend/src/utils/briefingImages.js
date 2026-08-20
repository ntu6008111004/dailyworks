export const MAX_BRIEFING_IMAGES = 15;

export function parseStoredImageArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

// New briefings store Storage URLs in an array.  The six legacy text columns
// can still contain Base64 values, so use them only when the new array is empty.
export function getBriefingImages(record, arrayField, legacyPrefix, limit = MAX_BRIEFING_IMAGES) {
  const storedImages = parseStoredImageArray(record?.[arrayField]);
  if (storedImages.length) return storedImages.slice(0, limit);
  return Array.from({ length: 6 }, (_, index) => record?.[`${legacyPrefix}${index + 1}`])
    .filter(Boolean)
    .slice(0, limit);
}
