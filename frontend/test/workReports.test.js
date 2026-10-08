import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_REPORT_ATTACHMENTS, MAX_REPORT_FILE_BYTES, REPORT_FILE_ACCEPT,
  canAccessReportsPage, canEditReport, canSubmitReport, canUseGzip, canViewReport,
  classifyReportFile, filterReports, formatFileSize, getFileExtension, getReportPeriodLabel,
  getReportPeriodRange, getReportSpan, gunzipBlob, gzipBlob, isWorthCompressing,
  parseReportAttachments, prepareReportFile, summarizeReports,
} from '../src/utils/workReports.js';
import { getSafeRedirectPath } from '../src/utils/loginRedirect.js';

const fakeFile = (name, content, type = '') => {
  const blob = new Blob([content], { type });
  blob.name = name;
  return blob;
};

test('every requested document type is accepted, by extension even without a MIME type', () => {
  assert.equal(classifyReportFile({ name: 'สรุป.PDF', type: '' }).category, 'pdf');
  assert.equal(classifyReportFile({ name: 'a.docx', type: 'application/octet-stream' }).category, 'word');
  assert.equal(classifyReportFile({ name: 'a.doc' }).gzip, true);
  assert.equal(classifyReportFile({ name: 'deck.pptx' }).category, 'powerpoint');
  assert.equal(classifyReportFile({ name: 'deck.ppt' }).gzip, true);
  assert.equal(classifyReportFile({ name: 'note.md' }).mimeType, 'text/markdown');
  assert.equal(classifyReportFile({ name: 'yod.xlsx' }).category, 'excel');
  assert.equal(classifyReportFile({ name: 'IMG_1.HEIC' }).kind, 'image');
  assert.equal(classifyReportFile({ name: 'screen', type: 'image/png' }).kind, 'image');
  assert.equal(classifyReportFile({ name: 'vector.svg', type: 'image/svg+xml' }), null);
  assert.equal(classifyReportFile({ name: 'setup.exe' }), null);
  assert.equal(classifyReportFile(null), null);
  assert.equal(getFileExtension('noext'), '');
  assert.match(REPORT_FILE_ACCEPT, /\.pptx/);
  assert.equal(MAX_REPORT_ATTACHMENTS, 25);
});

test('gzip round-trips and is only kept when it saves at least 10%', async () => {
  assert.equal(canUseGzip(), true);
  const text = '# สรุปยอด\n'.repeat(500);
  const packed = await gzipBlob(new Blob([text]));
  assert.ok(packed.size < new Blob([text]).size / 5);
  assert.equal(await (await gunzipBlob(packed, 'text/markdown')).text(), text);
  assert.equal(isWorthCompressing(1000, 900), true);
  assert.equal(isWorthCompressing(1000, 950), false);
  assert.equal(isWorthCompressing(1000, 0), false);
});

test('prepareReportFile compresses images, gzips text and leaves PDFs alone', async () => {
  const image = await prepareReportFile(fakeFile('a.jpg', 'x'.repeat(5000), 'image/jpeg'), {
    compressImage: async () => ({ blob: new Blob(['small'], { type: 'image/webp' }), mimeType: 'image/webp' }),
  });
  assert.deepEqual([image.kind, image.uploadType, image.size, image.originalSize], ['image', 'image/webp', 5, 5000]);

  const md = await prepareReportFile(fakeFile('note.md', 'ยอดขาย\n'.repeat(400)));
  assert.equal(md.encoding, 'gzip');
  assert.equal(md.uploadType, 'application/gzip');
  assert.equal(md.mimeType, 'text/markdown');

  const tiny = await prepareReportFile(fakeFile('t.txt', 'a'));
  assert.equal(tiny.encoding, '');

  const noGzip = await prepareReportFile(fakeFile('n.md', 'x'.repeat(2000)), { gzip: false });
  assert.equal(noGzip.encoding, '');

  const pdf = await prepareReportFile(fakeFile('r.pdf', '%PDF'.repeat(1000)));
  assert.deepEqual([pdf.encoding, pdf.uploadType], ['', 'application/pdf']);

  await assert.rejects(prepareReportFile(fakeFile('x.exe', 'a')), /ไม่รองรับ/);
  const huge = { name: 'big.pdf', type: 'application/pdf', size: MAX_REPORT_FILE_BYTES + 1 };
  await assert.rejects(prepareReportFile(huge), /ใหญ่เกิน/);
});

test('page access and submit are on by default and can be switched off per person', () => {
  assert.equal(canAccessReportsPage(null), false);
  assert.equal(canAccessReportsPage({ Role: 'Staff' }), true);
  assert.equal(canAccessReportsPage({ Role: 'Staff', Permissions: { canViewReportsPage: false } }), false);
  assert.equal(canAccessReportsPage({ Role: 'Admin', Permissions: { canViewReportsPage: false } }), true);
  assert.equal(canSubmitReport({ Role: 'Staff', Permissions: { canSubmitReport: false } }), false);
  assert.equal(canSubmitReport({ Role: 'Staff', Permissions: { canViewReportsPage: false } }), false);
  assert.equal(canSubmitReport({ Role: 'Admin', Permissions: { canSubmitReport: false } }), true);
  assert.equal(canSubmitReport({ Role: 'Head', Permissions: {} }), true);
});

test('reports are visible to the author, the department and admins; editable by author and admins', () => {
  const report = { CreatorID: 'u1', Department: 'Marketing' };
  assert.equal(canViewReport(report, { ID: 'u1', Department: 'Other' }), true);
  assert.equal(canViewReport(report, { ID: 'u2', Department: 'Marketing' }), true);
  assert.equal(canViewReport(report, { ID: 'u3', Department: 'Sales' }), false);
  assert.equal(canViewReport({ CreatorID: 'u1', Department: '' }, { ID: 'u3', Department: '' }), false);
  assert.equal(canViewReport(report, { ID: 'a', Role: 'Admin' }), true);
  assert.equal(canViewReport(null, { ID: 'u1' }), false);
  assert.equal(canEditReport(report, { ID: 'u1' }), true);
  assert.equal(canEditReport(report, { ID: 'u2', Role: 'Head', Department: 'Marketing' }), false);
  assert.equal(canEditReport(report, { ID: 'a', Role: 'Admin' }), true);
  assert.equal(canEditReport(report, null), false);
});

test('period ranges are Monday–Sunday weeks and calendar months', () => {
  assert.deepEqual(getReportPeriodRange('weekly', '2026-10-08'), { start: '2026-10-05', end: '2026-10-11' });
  assert.deepEqual(getReportPeriodRange('weekly', '2026-10-11'), { start: '2026-10-05', end: '2026-10-11' });
  assert.deepEqual(getReportPeriodRange('monthly', '2026-02-14'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(getReportPeriodRange('other', '2026-02-14'), { start: '2026-02-14', end: '2026-02-14' });
  assert.match(getReportPeriodRange('weekly').start, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(getReportPeriodLabel('monthly'), 'ประจำเดือน');
  assert.equal(getReportPeriodLabel('x'), 'อื่นๆ');
});

test('filters match search, type, department, person, mine and overlapping dates', () => {
  const reports = [
    { ID: 1, Title: 'ยอดผู้ใช้', Detail: '', PeriodType: 'weekly', PeriodStart: '2026-10-05', PeriodEnd: '2026-10-11', CreatorID: 'u1', Department: 'MKT', Attachments: [{ url: 'https://x/a', name: 'line-album.pdf' }] },
    { ID: 2, Title: 'สรุปเดือน', Detail: 'ยอดขาย', PeriodType: 'monthly', PeriodStart: '2026-09-01', PeriodEnd: '2026-09-30', CreatorID: 'u2', Department: 'Sales', CreatorName: 'สมชาย' },
    { ID: 3, Title: 'อื่น', PeriodType: 'other', CreatedAt: '2026-10-01T03:00:00Z', CreatorID: 'u1', Department: 'MKT' },
  ];
  const ids = (options) => filterReports(reports, options).map((item) => item.ID);
  assert.deepEqual(ids(), [1, 2, 3]);
  assert.deepEqual(ids({ search: 'LINE-ALBUM' }), [1]);
  assert.deepEqual(ids({ search: 'สมชาย' }), [2]);
  assert.deepEqual(ids({ periodType: 'monthly' }), [2]);
  assert.deepEqual(ids({ department: 'MKT' }), [1, 3]);
  assert.deepEqual(ids({ userId: 'u2' }), [2]);
  assert.deepEqual(ids({ mine: true, viewer: { ID: 'u1' } }), [1, 3]);
  assert.deepEqual(ids({ startDate: '2026-10-01', endDate: '2026-10-06' }), [1, 3]);
  assert.deepEqual(ids({ endDate: '2026-09-15' }), [2]);
  assert.deepEqual(filterReports(null), []);
  assert.deepEqual(getReportSpan({}), { start: '', end: '' });
  assert.deepEqual(getReportSpan({ PeriodEnd: '2026-01-02' }), { start: '2026-01-02', end: '2026-01-02' });

  assert.deepEqual(summarizeReports(reports, { ID: 'u1' }), { total: 3, weekly: 1, monthly: 1, other: 1, mine: 2, files: 1 });
  assert.equal(summarizeReports(null).total, 0);
});

test('attachments parse from JSON and sizes format for people', () => {
  assert.deepEqual(parseReportAttachments('[{"url":"https://x","name":"a"},{"name":"no url"}]'), [{ url: 'https://x', name: 'a' }]);
  assert.deepEqual(parseReportAttachments('not json'), []);
  assert.deepEqual(parseReportAttachments(null), []);
  assert.equal(formatFileSize(0), '');
  assert.equal(formatFileSize(500), '500 B');
  assert.equal(formatFileSize(2048), '2 KB');
  assert.equal(formatFileSize(3.5 * 1024 * 1024), '3.5 MB');
});

test('login only returns to same-app paths', () => {
  assert.equal(getSafeRedirectPath({ pathname: '/reports/abc', search: '?x=1', hash: '' }), '/reports/abc?x=1');
  assert.equal(getSafeRedirectPath('/reports/abc'), '/reports/abc');
  assert.equal(getSafeRedirectPath('//evil.example'), '/');
  assert.equal(getSafeRedirectPath('/\\evil.example'), '/');
  assert.equal(getSafeRedirectPath('https://evil.example'), '/');
  assert.equal(getSafeRedirectPath('/login'), '/');
  assert.equal(getSafeRedirectPath(undefined), '/');
});
