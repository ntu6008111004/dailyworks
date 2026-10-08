// Weekly / monthly work reports ("ส่งสรุปงาน"): file rules, permissions and
// filtering. Kept free of React and Supabase so it runs under node --test.

export const MAX_REPORT_ATTACHMENTS = 25;
// Matches the worklog-files bucket limit in 20261008_work_reports.sql.
export const MAX_REPORT_FILE_BYTES = 25 * 1024 * 1024;

export const REPORT_PERIOD_TYPES = [
  { value: 'weekly', label: 'ประจำสัปดาห์' },
  { value: 'monthly', label: 'ประจำเดือน' },
  { value: 'other', label: 'อื่นๆ' },
];

export function getReportPeriodLabel(type) {
  return REPORT_PERIOD_TYPES.find((item) => item.value === type)?.label || 'อื่นๆ';
}

// Extension is the source of truth: Windows and phones often report an empty
// or generic MIME type for Office and Markdown files.
const FILE_TYPES = {
  pdf: { category: 'pdf', mimeType: 'application/pdf' },
  doc: { category: 'word', mimeType: 'application/msword', gzip: true },
  docx: { category: 'word', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  ppt: { category: 'powerpoint', mimeType: 'application/vnd.ms-powerpoint', gzip: true },
  pptx: { category: 'powerpoint', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  xls: { category: 'excel', mimeType: 'application/vnd.ms-excel', gzip: true },
  xlsx: { category: 'excel', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  csv: { category: 'excel', mimeType: 'text/csv', gzip: true },
  md: { category: 'markdown', mimeType: 'text/markdown', gzip: true },
  markdown: { category: 'markdown', mimeType: 'text/markdown', gzip: true },
  txt: { category: 'text', mimeType: 'text/plain', gzip: true },
};
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif']);

export const REPORT_FILE_ACCEPT = [
  'image/*', '.heic', '.heif',
  ...Object.keys(FILE_TYPES).map((ext) => `.${ext}`),
].join(',');

export const REPORT_FILE_HINT = 'รูปภาพ, PDF, Word, PowerPoint, Excel, Markdown, TXT';

export function getFileExtension(name) {
  const match = /\.([a-z0-9]+)$/i.exec(String(name || ''));
  return match ? match[1].toLowerCase() : '';
}

/**
 * What a picked file is, or null when the report page does not accept it.
 * PDF, DOCX, PPTX and XLSX are already compressed containers, so only plain
 * text and the legacy binary Office formats are worth gzipping.
 */
export function classifyReportFile(file) {
  if (!file) return null;
  const ext = getFileExtension(file.name);
  const type = String(file.type || '').toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext) || (type.startsWith('image/') && !type.includes('svg'))) {
    return { kind: 'image', category: 'image', mimeType: type || 'image/jpeg', gzip: false };
  }
  const known = FILE_TYPES[ext];
  if (!known) return null;
  return { kind: 'file', category: known.category, mimeType: known.mimeType, gzip: Boolean(known.gzip) };
}

/** gzip is kept only when it saves at least 10%; otherwise the original is uploaded. */
export function isWorthCompressing(originalBytes, compressedBytes) {
  return Number(compressedBytes) > 0 && Number(compressedBytes) <= Number(originalBytes) * 0.9;
}

async function pipeBlob(blob, stream, type) {
  const response = new Response(blob.stream().pipeThrough(stream));
  const buffer = await response.arrayBuffer();
  return new Blob([buffer], { type });
}

export function canUseGzip() {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

export function gzipBlob(blob) {
  return pipeBlob(blob, new CompressionStream('gzip'), 'application/gzip');
}

export function gunzipBlob(blob, type = 'application/octet-stream') {
  return pipeBlob(blob, new DecompressionStream('gzip'), type);
}

export function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Turns a picked file into what gets uploaded. `compressImage` is the app's
 * compressImageDetails (injected so this stays testable outside a browser).
 */
export async function prepareReportFile(file, { compressImage, gzip = canUseGzip() } = {}) {
  const info = classifyReportFile(file);
  if (!info) throw new Error(`${file?.name || 'ไฟล์นี้'} ไม่รองรับ (รองรับ ${REPORT_FILE_HINT})`);
  const base = {
    name: file.name || 'ไฟล์แนบ',
    kind: info.kind,
    category: info.category,
    originalSize: file.size,
  };

  if (info.kind === 'image') {
    const result = await compressImage(file);
    return { ...base, blob: result.blob, mimeType: result.mimeType, uploadType: result.mimeType, size: result.blob.size, encoding: '' };
  }

  if (file.size > MAX_REPORT_FILE_BYTES) {
    throw new Error(`${base.name} ใหญ่เกิน ${formatFileSize(MAX_REPORT_FILE_BYTES)} กรุณาลดขนาดไฟล์ก่อนแนบ`);
  }
  if (info.gzip && gzip) {
    const packed = await gzipBlob(file);
    if (isWorthCompressing(file.size, packed.size)) {
      return { ...base, blob: packed, mimeType: info.mimeType, uploadType: 'application/gzip', size: packed.size, encoding: 'gzip' };
    }
  }
  return { ...base, blob: file, mimeType: info.mimeType, uploadType: info.mimeType, size: file.size, encoding: '' };
}

export function parseReportAttachments(value) {
  let list = value;
  if (typeof value === 'string') {
    try { list = JSON.parse(value); } catch { list = []; }
  }
  return Array.isArray(list) ? list.filter((item) => item && typeof item === 'object' && item.url) : [];
}

const isAdmin = (user) => user?.Role === 'Admin';

/** Page access is on unless an admin switched it off for this person. */
export function canAccessReportsPage(user) {
  if (!user) return false;
  return isAdmin(user) || user.Permissions?.canViewReportsPage !== false;
}

export function canSubmitReport(user) {
  return canAccessReportsPage(user) && (isAdmin(user) || user.Permissions?.canSubmitReport !== false);
}

/** Admins see every report; everyone else sees their own and their department's. */
export function canViewReport(report, user) {
  if (!report || !user) return false;
  if (isAdmin(user) || String(report.CreatorID) === String(user.ID)) return true;
  return Boolean(user.Department) && report.Department === user.Department;
}

export function canEditReport(report, user) {
  if (!report || !user) return false;
  return isAdmin(user) || String(report.CreatorID) === String(user.ID);
}

const pad = (value) => String(value).padStart(2, '0');
const toKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function parseDateKey(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Monday–Sunday week, or the calendar month, that contains `dateKey` (yyyy-MM-dd). */
export function getReportPeriodRange(type, dateKey = toKey(new Date())) {
  const date = parseDateKey(dateKey);
  if (type === 'monthly') {
    return {
      start: toKey(new Date(date.getFullYear(), date.getMonth(), 1)),
      end: toKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
    };
  }
  if (type === 'weekly') {
    const offset = (date.getDay() + 6) % 7;
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
    return { start: toKey(monday), end: toKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)) };
  }
  return { start: dateKey, end: dateKey };
}

/** The dates a report covers, falling back to the day it was posted (Bangkok). */
export function getReportSpan(report) {
  const posted = report?.CreatedAt
    ? new Date(report.CreatedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    : '';
  const start = report?.PeriodStart || report?.PeriodEnd || posted;
  const end = report?.PeriodEnd || report?.PeriodStart || posted;
  return { start, end };
}

export function filterReports(reports, {
  search = '', periodType = 'All', department = 'All', userId = 'All', mine = false,
  startDate = '', endDate = '', viewer = null,
} = {}) {
  const query = String(search).trim().toLowerCase();
  return (reports || []).filter((report) => {
    if (periodType !== 'All' && report.PeriodType !== periodType) return false;
    if (department !== 'All' && report.Department !== department) return false;
    if (userId !== 'All' && String(report.CreatorID) !== String(userId)) return false;
    if (mine && String(report.CreatorID) !== String(viewer?.ID)) return false;
    if (startDate || endDate) {
      const span = getReportSpan(report);
      if (startDate && span.end && span.end < startDate) return false;
      if (endDate && span.start && span.start > endDate) return false;
    }
    if (query) {
      const haystack = [
        report.Title, report.Detail, report.CreatorName,
        ...parseReportAttachments(report.Attachments).map((item) => item.name),
      ].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function summarizeReports(reports, viewer) {
  const summary = { total: 0, weekly: 0, monthly: 0, other: 0, mine: 0, files: 0 };
  for (const report of reports || []) {
    summary.total += 1;
    const type = ['weekly', 'monthly'].includes(report.PeriodType) ? report.PeriodType : 'other';
    summary[type] += 1;
    if (viewer && String(report.CreatorID) === String(viewer.ID)) summary.mine += 1;
    summary.files += parseReportAttachments(report.Attachments).length;
  }
  return summary;
}
