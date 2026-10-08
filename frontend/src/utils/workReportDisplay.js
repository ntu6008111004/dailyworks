import { format } from 'date-fns';
import { th } from 'date-fns/locale';

// Display helpers shared by the report page and its modals.
export const PERIOD_BADGE_STYLES = {
  weekly: 'bg-sky-50 text-sky-700 border-sky-200',
  monthly: 'bg-violet-50 text-violet-700 border-violet-200',
  other: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const formatReportDate = (value, pattern = 'd MMM yy') => {
  if (!value) return '';
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? '' : format(date, pattern, { locale: th });
};

export const formatReportPeriod = (report) => {
  const start = formatReportDate(report?.PeriodStart);
  const end = formatReportDate(report?.PeriodEnd);
  if (start && end && start !== end) return `${start} – ${end}`;
  return start || end || '';
};

export const getReportShareUrl = (id) => `${window.location.origin}/reports/${id}`;

// navigator.clipboard needs a secure context; the textarea path keeps the
// button working on an http:// LAN address. When a browser (some in-app ones)
// refuses both, the link is shown in a prompt to copy by hand.
// Resolves 'copied' or 'manual'.
export async function copyReportLink(report) {
  const text = `${report.Title}\n${getReportShareUrl(report.ID)}`;
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    if (ok) return 'copied';
    window.prompt('คัดลอกลิงก์นี้เพื่อส่งต่อ', getReportShareUrl(report.ID));
    return 'manual';
  }
}
