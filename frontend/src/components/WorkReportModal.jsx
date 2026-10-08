import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, ChevronRight, Copy, Download, Edit2, ExternalLink, Eye, File, FileSpreadsheet, FileText,
  Image as ImageIcon, Link as LinkIcon, Loader2, Presentation, Save, Trash2, UploadCloud, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { compressImageDetails, snapshotSelectedFiles } from '../utils/compressImage';
import { normalizeExternalLink } from '../utils/externalLinks';
import { PERIOD_BADGE_STYLES, copyReportLink, formatReportDate, formatReportPeriod } from '../utils/workReportDisplay';
import {
  MAX_REPORT_ATTACHMENTS, REPORT_FILE_ACCEPT, REPORT_FILE_HINT, REPORT_PERIOD_TYPES,
  classifyReportFile, formatFileSize, getFileExtension, getReportPeriodLabel, getReportPeriodRange,
  gunzipBlob, parseReportAttachments, prepareReportFile,
} from '../utils/workReports';
import { CustomSelect } from './CustomSelect';
import { CustomDatePicker } from './CustomDatePicker';

const TEXT_PREVIEW_CATEGORIES = new Set(['markdown', 'text']);
const TEXT_PREVIEW_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'csv']);

export const FileTypeIcon = ({ category, size = 18 }) => {
  const icons = {
    pdf: <FileText size={size} className="text-rose-600" />,
    word: <FileText size={size} className="text-blue-600" />,
    powerpoint: <Presentation size={size} className="text-orange-600" />,
    excel: <FileSpreadsheet size={size} className="text-emerald-600" />,
    markdown: <FileText size={size} className="text-slate-700" />,
    text: <FileText size={size} className="text-slate-500" />,
    image: <ImageIcon size={size} className="text-sky-600" />,
  };
  return icons[category] || <File size={size} className="text-slate-500" />;
};

const categoryOf = (attachment) => (attachment.kind === 'image'
  ? 'image'
  : classifyReportFile({ name: attachment.name, type: attachment.mimeType })?.category || 'file');

/** Fetches a stored attachment and restores the original bytes when it was gzipped. */
async function fetchAttachmentBlob(attachment) {
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error(`ดาวน์โหลดไม่สำเร็จ (${response.status})`);
  const blob = await response.blob();
  if (attachment.encoding === 'gzip') return gunzipBlob(blob, attachment.mimeType || 'application/octet-stream');
  return attachment.mimeType ? new Blob([blob], { type: attachment.mimeType }) : blob;
}

async function downloadAttachment(attachment) {
  const blob = await fetchAttachmentBlob(attachment);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.name || 'attachment';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// While a report popup is open the floating CatLog AI button is hidden: it
// sits above every modal (z-index 9998) and covered the "แก้ไข" button on phones.
function useModalOpenClass() {
  useEffect(() => {
    document.body.classList.add('report-modal-open');
    return () => document.body.classList.remove('report-modal-open');
  }, []);
}

const ModalShell = ({ children, onClose, wide = false, busy = false }) => {
  useModalOpenClass();
  return createPortal(
    <div
      className="report-modal fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}
    >
      <div className={`report-modal-panel flex w-full min-w-0 flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-4xl' : 'sm:max-w-3xl'}`}>
        {children}
      </div>
    </div>,
    document.body,
  );
};

const Lightbox = ({ images, index, onClose, onMove }) => {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') onMove(-1);
      if (event.key === 'ArrowRight') onMove(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onMove]);
  const image = images[index];
  if (!image) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4" onClick={onClose}>
      <img src={image.url} alt={image.name} className="max-h-[88vh] max-w-full rounded-xl object-contain shadow-2xl" onClick={(event) => event.stopPropagation()} />
      <button type="button" aria-label="ปิด" onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"><X size={22} /></button>
      {images.length > 1 && <>
        <button type="button" aria-label="รูปก่อนหน้า" onClick={(event) => { event.stopPropagation(); onMove(-1); }} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"><ChevronLeft size={26} /></button>
        <button type="button" aria-label="รูปถัดไป" onClick={(event) => { event.stopPropagation(); onMove(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"><ChevronRight size={26} /></button>
      </>}
      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">{index + 1} / {images.length}</span>
    </div>,
    document.body,
  );
};

const PersonAvatar = ({ person }) => person?.ProfileImage && person.ProfileImage !== 'has_image' ? (
  <img src={person.ProfileImage} alt="" className="h-9 w-9 shrink-0 rounded-full border border-slate-200 object-cover" />
) : (
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
    {(person?.Name || person?.Username || '?').charAt(0).toUpperCase()}
  </span>
);

// ───────────────────────────────────────────────────────────────────────────
// Detail view — also what a shared LINE link opens.
// ───────────────────────────────────────────────────────────────────────────
export const WorkReportDetailModal = ({ report, creator, canEdit, onClose, onEdit, onDelete }) => {
  const attachments = parseReportAttachments(report.Attachments);
  const images = attachments.filter((item) => item.kind === 'image');
  const files = attachments.filter((item) => item.kind !== 'image');
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [busyFile, setBusyFile] = useState(null);
  const [textPreview, setTextPreview] = useState(null);
  const refUrl = normalizeExternalLink(report.RefURL);

  const moveLightbox = useCallback((step) => {
    setLightboxIndex((current) => (current === null ? null : (current + step + images.length) % images.length));
  }, [images.length]);

  const handleCopy = async () => {
    try {
      if (await copyReportLink(report) === 'copied') {
        toast.success('คัดลอกลิงก์แล้ว ส่งต่อทาง LINE ได้เลย (ผู้รับต้องเข้าสู่ระบบก่อน)');
      }
    } catch {
      toast.error('คัดลอกไม่สำเร็จ');
    }
  };

  const handleDownload = async (attachment) => {
    setBusyFile(attachment.url);
    try {
      await downloadAttachment(attachment);
    } catch (error) {
      toast.error(error.message || 'ดาวน์โหลดไม่สำเร็จ');
    } finally {
      setBusyFile(null);
    }
  };

  const canPreviewText = (attachment) => TEXT_PREVIEW_CATEGORIES.has(categoryOf(attachment))
    || TEXT_PREVIEW_EXTENSIONS.has(getFileExtension(attachment.name));
  // A gzipped file's public URL serves the .gz bytes, so only plain PDFs open directly.
  const canOpenDirectly = (attachment) => attachment.encoding !== 'gzip' && categoryOf(attachment) === 'pdf';

  const handlePreview = async (attachment) => {
    setBusyFile(attachment.url);
    try {
      const blob = await fetchAttachmentBlob(attachment);
      setTextPreview({ name: attachment.name, text: await blob.text() });
    } catch (error) {
      toast.error(error.message || 'เปิดไฟล์ไม่สำเร็จ');
    } finally {
      setBusyFile(null);
    }
  };

  return (
    <ModalShell onClose={onClose} wide>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${PERIOD_BADGE_STYLES[report.PeriodType] || PERIOD_BADGE_STYLES.other}`}>{getReportPeriodLabel(report.PeriodType)}</span>
            {formatReportPeriod(report) && <span className="text-xs font-semibold text-slate-500">{formatReportPeriod(report)}</span>}
          </div>
          <h3 className="break-words text-lg font-black text-slate-900 sm:text-xl">{report.Title}</h3>
        </div>
        <button type="button" aria-label="ปิด" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
      </div>

      <div className="min-w-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-5 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <PersonAvatar person={creator} />
          <div className="min-w-0 text-sm">
            <p className="truncate font-bold text-slate-800">{creator?.Name || creator?.Username || 'ไม่ทราบผู้ส่ง'}</p>
            <p className="text-xs text-slate-500">
              {report.Department || creator?.Department || '-'} · ส่งเมื่อ {formatReportDate(report.CreatedAt, 'd MMM yy HH:mm')}
              {report.UpdatedAt && report.UpdatedAt !== report.CreatedAt && ` · แก้ไข ${formatReportDate(report.UpdatedAt, 'd MMM yy HH:mm')}`}
            </p>
          </div>
        </div>

        {report.Detail
          ? <p className="whitespace-pre-wrap break-words rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">{report.Detail}</p>
          : <p className="text-sm text-slate-400">ไม่มีรายละเอียดเพิ่มเติม</p>}

        {refUrl && (
          <a href={refUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">
            <LinkIcon size={15} className="shrink-0" /><span className="truncate">{report.RefURL}</span><ExternalLink size={14} className="ml-auto shrink-0" />
          </a>
        )}

        {images.length > 0 && (
          <section>
            <p className="mb-2 text-sm font-black text-slate-800">รูปภาพ ({images.length})</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {images.map((image, index) => (
                <button type="button" key={image.url} onClick={() => setLightboxIndex(index)} className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <img src={image.url} alt={image.name} loading="lazy" className="h-full w-full object-cover transition hover:scale-105" />
                </button>
              ))}
            </div>
          </section>
        )}

        {files.length > 0 && (
          <section>
            <p className="mb-2 text-sm font-black text-slate-800">ไฟล์เอกสาร ({files.length})</p>
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
              {files.map((file) => (
                <li key={file.url} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50"><FileTypeIcon category={categoryOf(file)} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800" title={file.name}>{file.name}</p>
                    <p className="text-[11px] text-slate-400">{formatFileSize(file.originalSize || file.size)}{file.encoding === 'gzip' && file.originalSize > file.size ? ` · เก็บจริง ${formatFileSize(file.size)}` : ''}</p>
                  </div>
                  {canOpenDirectly(file) && (
                    <a href={file.url} target="_blank" rel="noopener noreferrer" title="เปิดดู" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600"><Eye size={17} /></a>
                  )}
                  {canPreviewText(file) && (
                    <button type="button" title="เปิดดู" disabled={busyFile === file.url} onClick={() => handlePreview(file)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600"><Eye size={17} /></button>
                  )}
                  <button type="button" title="ดาวน์โหลด" disabled={busyFile === file.url} onClick={() => handleDownload(file)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600">
                    {busyFile === file.url ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {textPreview && (
          <section className="rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <p className="truncate text-xs font-bold text-slate-600">{textPreview.name}</p>
              <button type="button" aria-label="ปิดตัวอย่าง" onClick={() => setTextPreview(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={14} /></button>
            </div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words px-4 py-3 text-xs leading-relaxed text-slate-700">{textPreview.text}</pre>
          </section>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        {canEdit && (
          <button type="button" onClick={onDelete} className="mr-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50"><Trash2 size={16} />ลบ</button>
        )}
        <button type="button" onClick={handleCopy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"><Copy size={16} />คัดลอกลิงก์</button>
        {canEdit && (
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"><Edit2 size={16} />แก้ไข</button>
        )}
      </div>

      {lightboxIndex !== null && <Lightbox images={images} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onMove={moveLightbox} />}
    </ModalShell>
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Create / edit form
// ───────────────────────────────────────────────────────────────────────────
let itemSeq = 0;
const nextKey = () => `item-${Date.now()}-${itemSeq++}`;

export const WorkReportFormModal = ({ report, onClose, onSaved }) => {
  const isEdit = Boolean(report?.ID);
  const [form, setForm] = useState(() => {
    const range = getReportPeriodRange(report?.PeriodType || 'weekly');
    return {
      Title: report?.Title || '',
      Detail: report?.Detail || '',
      PeriodType: report?.PeriodType || 'weekly',
      PeriodStart: report ? (report.PeriodStart || '') : range.start,
      PeriodEnd: report ? (report.PeriodEnd || '') : range.end,
      RefURL: report?.RefURL || '',
    };
  });
  // Saved attachments keep their metadata; new picks hold a prepared blob until save.
  const [items, setItems] = useState(() => parseReportAttachments(report?.Attachments)
    .map((attachment) => ({ key: nextKey(), status: 'saved', attachment, previewUrl: attachment.kind === 'image' ? attachment.url : '' })));
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [dragging, setDragging] = useState(false);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => () => {
    itemsRef.current.forEach((item) => { if (item.status !== 'saved' && item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
  }, []);

  const processing = items.some((item) => item.status === 'processing');
  const totalSaved = items.reduce((sum, item) => {
    const data = item.prepared || item.attachment;
    return data ? sum + Math.max(0, (data.originalSize || 0) - (data.size || 0)) : sum;
  }, 0);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const changePeriodType = (type) => {
    setForm((current) => {
      if (type === 'other') return { ...current, PeriodType: type };
      const range = getReportPeriodRange(type, current.PeriodStart || undefined);
      return { ...current, PeriodType: type, PeriodStart: range.start, PeriodEnd: range.end };
    });
  };

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const room = MAX_REPORT_ATTACHMENTS - itemsRef.current.length;
    if (room <= 0) {
      toast.error(`แนบได้สูงสุด ${MAX_REPORT_ATTACHMENTS} ไฟล์ต่อรายงาน`);
      return;
    }
    const accepted = files.slice(0, room);
    if (files.length > room) toast.error(`แนบได้อีก ${room} ไฟล์ ไฟล์ที่เกินจะไม่ถูกเพิ่ม`);

    const queued = accepted.map((file) => ({ key: nextKey(), status: 'processing', file, name: file.name }));
    setItems((current) => [...current, ...queued]);

    // One at a time: compressing many phone photos at once can exhaust memory on mobile.
    for (const entry of queued) {
      try {
        const prepared = await prepareReportFile(entry.file, { compressImage: compressImageDetails });
        const previewUrl = prepared.kind === 'image' ? URL.createObjectURL(prepared.blob) : '';
        setItems((current) => current.map((item) => (item.key === entry.key ? { key: item.key, status: 'ready', prepared, previewUrl } : item)));
      } catch (error) {
        toast.error(error.message || `เตรียม ${entry.name} ไม่สำเร็จ`);
        setItems((current) => current.filter((item) => item.key !== entry.key));
      }
    }
  };

  const removeItem = (key) => {
    setItems((current) => {
      const target = current.find((item) => item.key === key);
      if (target && target.status !== 'saved' && target.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.key !== key);
    });
  };

  const handlePaste = (event) => {
    const pasted = Array.from(event.clipboardData?.files || []);
    if (pasted.length) {
      event.preventDefault();
      addFiles(pasted);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.Title.trim()) {
      toast.error('กรุณาใส่หัวข้อ');
      return;
    }
    if (form.PeriodStart && form.PeriodEnd && form.PeriodEnd < form.PeriodStart) {
      toast.error('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
      return;
    }
    setSaving(true);
    try {
      const pending = items.filter((item) => item.status === 'ready');
      const uploaded = new Map();
      let done = 0;
      setProgress({ done, total: pending.length });
      for (const item of pending) {
        uploaded.set(item.key, await apiService.uploadReportFile(item.prepared));
        done += 1;
        setProgress({ done, total: pending.length });
      }
      const attachments = items
        .map((item) => (item.status === 'saved' ? item.attachment : uploaded.get(item.key)))
        .filter(Boolean);
      const saved = await apiService.saveWorkReport({ ...form, ID: report?.ID, Title: form.Title.trim(), Attachments: attachments });
      toast.success(isEdit ? 'บันทึกการแก้ไขแล้ว' : 'ส่งสรุปงานเรียบร้อย');
      onSaved(saved);
    } catch (error) {
      toast.error(error.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const imageItems = items.filter((item) => (item.prepared || item.attachment)?.kind === 'image');
  const fileItems = items.filter((item) => item.status === 'processing' || (item.prepared || item.attachment)?.kind === 'file');

  return (
    <ModalShell onClose={onClose} busy={saving}>
      <form onSubmit={handleSubmit} onPaste={handlePaste} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <h3 className="text-lg font-black text-slate-900">{isEdit ? 'แก้ไขสรุปงาน' : 'ส่งสรุปงานใหม่'}</h3>
          <button type="button" aria-label="ปิด" disabled={saving} onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-5 sm:px-6">
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-slate-700">หัวข้อ <span className="text-rose-500">*</span></span>
            <input className="field" maxLength={200} value={form.Title} onChange={(event) => setField('Title', event.target.value)} placeholder="เช่น สรุปยอดผู้ใช้งาน สัปดาห์ที่ 2 ต.ค." autoFocus />
          </label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <span className="mb-1.5 block text-xs font-black text-slate-700">ประเภท</span>
              <CustomSelect value={form.PeriodType} onChange={changePeriodType} options={REPORT_PERIOD_TYPES} />
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-black text-slate-700">ตั้งแต่</span>
              <CustomDatePicker value={form.PeriodStart} onChange={(value) => setField('PeriodStart', value)} placeholder="วันที่เริ่ม" portalId="report-date-portal" popperPlacement="bottom-start" />
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-black text-slate-700">ถึง</span>
              <CustomDatePicker value={form.PeriodEnd} onChange={(value) => setField('PeriodEnd', value)} placeholder="วันที่สิ้นสุด" portalId="report-date-portal" popperPlacement="bottom-end" />
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-slate-700">รายละเอียด</span>
            <textarea className="field min-h-32" value={form.Detail} onChange={(event) => setField('Detail', event.target.value)} placeholder="สรุปผลงาน ตัวเลข ยอด หรือสิ่งที่ต้องการรายงาน…" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-slate-700">ลิงก์อ้างอิง <span className="font-medium text-slate-400">(ไม่บังคับ เช่น ลิงก์อัลบั้ม/โน้ตใน LINE)</span></span>
            <input type="url" className="field" value={form.RefURL} onChange={(event) => setField('RefURL', event.target.value)} placeholder="https://…" />
          </label>

          <section>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-black text-slate-800">ไฟล์แนบ ({items.length}/{MAX_REPORT_ATTACHMENTS})</p>
                <p className="text-xs text-slate-500">{REPORT_FILE_HINT} · รูปบีบอัดอัตโนมัติ · เอกสารไม่เกิน 25 MB/ไฟล์</p>
              </div>
              {totalSaved > 0 && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">ลดขนาดได้ {formatFileSize(totalSaved)}</span>}
            </div>

            {items.length < MAX_REPORT_ATTACHMENTS && (
              <label
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50/60 hover:border-blue-300 hover:bg-blue-50/40'} ${saving ? 'pointer-events-none opacity-60' : ''}`}
              >
                <UploadCloud size={26} className="mb-1.5 text-blue-500" />
                <p className="text-sm font-bold text-slate-700 sm:hidden">แตะเพื่อเลือกรูปหรือไฟล์</p>
                <p className="hidden text-sm font-bold text-slate-700 sm:block">กดเพื่อเลือกไฟล์ ลากมาวาง หรือวาง (Ctrl+V) รูปที่คัดลอกไว้</p>
                <p className="text-xs text-slate-400">เลือกหลายไฟล์พร้อมกันได้</p>
                <input type="file" multiple accept={REPORT_FILE_ACCEPT} className="hidden" disabled={saving} onChange={(event) => addFiles(snapshotSelectedFiles(event.target))} />
              </label>
            )}

            {imageItems.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {imageItems.map((item) => {
                  const data = item.prepared || item.attachment;
                  return (
                    <div key={item.key} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <img src={item.previewUrl} alt={data.name} className="h-full w-full object-cover" />
                      {item.status === 'ready' && data.originalSize > data.size && (
                        <span className="absolute bottom-1 left-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">{formatFileSize(data.size)}</span>
                      )}
                      <button type="button" aria-label="ลบไฟล์" disabled={saving} onClick={() => removeItem(item.key)} className="absolute right-1 top-1 rounded-lg bg-rose-600 p-1 text-white shadow-sm sm:opacity-0 sm:group-hover:opacity-100"><X size={13} /></button>
                    </div>
                  );
                })}
              </div>
            )}

            {fileItems.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {fileItems.map((item) => {
                  const data = item.prepared || item.attachment;
                  return (
                    <li key={item.key} className="flex items-center gap-3 px-3 py-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                        {item.status === 'processing' ? <Loader2 size={16} className="animate-spin text-blue-500" /> : <FileTypeIcon category={data.category || categoryOf(data)} size={16} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{data?.name || item.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {item.status === 'processing' ? 'กำลังเตรียมไฟล์…' : formatFileSize(data.originalSize || data.size)}
                          {data?.encoding === 'gzip' && data.originalSize > data.size && ` → บีบอัดเหลือ ${formatFileSize(data.size)}`}
                        </p>
                      </div>
                      {item.status !== 'processing' && (
                        <button type="button" aria-label="ลบไฟล์" disabled={saving} onClick={() => removeItem(item.key)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={15} /></button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          {progress && progress.total > 0 && <span className="mr-auto text-xs font-semibold text-slate-500">อัปโหลด {progress.done}/{progress.total}</span>}
          <button type="button" disabled={saving} onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">ยกเลิก</button>
          <button type="submit" disabled={saving || processing} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'กำลังบันทึก…' : processing ? 'รอเตรียมไฟล์…' : isEdit ? 'บันทึกการแก้ไข' : 'ส่งสรุปงาน'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
