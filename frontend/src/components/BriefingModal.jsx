import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ClipboardCheck, ExternalLink, Image as ImageIcon,
  Link as LinkIcon, Loader2, Plus, Save, Send, UploadCloud, UserRound, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { compressImageDetails, formatImageSize, getImageFiles, snapshotSelectedFiles } from '../utils/compressImage';
import { getBriefingImages, MAX_BRIEFING_IMAGES } from '../utils/briefingImages';
import {
  canEditBriefingContent,
  canEditBriefingStatus,
  isBriefingAssignee,
  isBriefingCreator,
} from '../utils/briefingPermissions';
import { formatBriefingPoints, getBonusLevelDetails, getBriefingAwardedPoints, getBriefingPointOptions, getBriefingPointsError, isBriefingScoreLocked } from '../utils/briefingScore';
import { summarizeReviewNotes } from '../utils/briefingReviewNotes';
import { normalizeExternalLink } from '../utils/externalLinks';
import { CustomSelect } from './CustomSelect';

const MAX_IMAGES = MAX_BRIEFING_IMAGES;
const ASSIGNER_STATUSES = ['แก้ไข', 'ดำเนินการ', 'กำลังทำ', 'รอตรวจ', 'สั่งแก้ไข', 'ยกเลิกงาน', 'ส่งตรวจ'];
const STATUS_STYLES = {
  'แก้ไข': 'bg-violet-50 text-violet-700 border-violet-200',
  'ดำเนินการ': 'bg-slate-100 text-slate-700 border-slate-200',
  'รอดำเนินการ': 'bg-slate-100 text-slate-700 border-slate-200',
  'กำลังทำ': 'bg-blue-50 text-blue-700 border-blue-200',
  'รอตรวจ': 'bg-amber-50 text-amber-700 border-amber-200',
  'ส่งตรวจ': 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  'สั่งแก้ไข': 'bg-orange-50 text-orange-700 border-orange-200',
  'สั่งเพิ่มงาน': 'bg-sky-50 text-sky-700 border-sky-200',
  'รอแก้ไข': 'bg-orange-50 text-orange-700 border-orange-200',
  'ยกเลิกงาน': 'bg-zinc-100 text-zinc-700 border-zinc-200',
  'เสร็จสิ้น': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const PersonAvatar = ({ person, size = 'w-8 h-8' }) => person?.ProfileImage ? (
  <img src={person.ProfileImage} alt="" className={`${size} rounded-full border border-white object-cover shadow-sm`} />
) : (
  <span className={`${size} flex items-center justify-center rounded-full border border-slate-200 bg-slate-100 font-bold text-slate-600`}>
    {(person?.Name || person?.Username || 'U').charAt(0).toUpperCase()}
  </span>
);

const StatusPill = ({ status }) => <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[status] || STATUS_STYLES['ดำเนินการ']}`}>{status || 'ดำเนินการ'}</span>;
const FieldLabel = ({ text, optional }) => <span className="mb-1.5 block text-xs font-black text-slate-700">{text}{optional && <span className="ml-1 font-medium text-slate-400">(ไม่บังคับ)</span>}</span>;

const ReferenceLinkField = ({ value, editable, onChange }) => {
  const safeUrl = normalizeExternalLink(value);
  return <div><FieldLabel text="ลิงก์อ้างอิง" optional />{editable ? <><input type="url" value={value} onChange={onChange} className="field" placeholder="https://…" />{safeUrl && <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 transition hover:text-blue-800 hover:underline"><ExternalLink size={12} />เปิดลิงก์นี้ในแท็บใหม่</a>}</> : safeUrl ? <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="field flex items-center gap-2 text-blue-700 hover:bg-blue-50"><LinkIcon size={14} /><span className="truncate">{value}</span><ExternalLink className="ml-auto shrink-0" size={14} /></a> : <p className="field text-slate-400">ไม่มีลิงก์อ้างอิง</p>}</div>;
};

const ImageGrid = ({ images, editable, onRemove, onPreview, label, onAdd, isUploading, sizes }) => (
  <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-sm font-black text-slate-800">{label}</p><p className="text-xs text-slate-500">สูงสุด {MAX_IMAGES} รูป · บีบอัดและเก็บใน Storage ไม่เกิน 2 MB/รูป</p></div>
      {editable && images.length < MAX_IMAGES && <label className={`inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 ${isUploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
        {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}{isUploading ? 'กำลังอัปโหลด…' : `เพิ่มรูป (${images.length}/${MAX_IMAGES})`}
        <input className="hidden" type="file" accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp" multiple disabled={isUploading} onChange={onAdd} />
      </label>}
    </div>
    {images.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">{images.map((image, index) => <div key={`${image}-${index}`} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <img src={image} alt={`รูปที่ ${index + 1}`} className="h-full w-full cursor-zoom-in object-cover" onClick={() => onPreview(image)} />
      {sizes[image] && <span className="absolute bottom-1 left-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">{formatImageSize(sizes[image])}</span>}
      {editable && <button type="button" aria-label="ลบรูป" onClick={() => onRemove(index)} className="absolute right-1 top-1 rounded-lg bg-rose-600 p-1 text-white opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100"><X size={13} /></button>}
    </div>)}</div> : <div className="flex min-h-28 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-slate-400"><ImageIcon size={23} className="mb-2" /><p className="text-xs font-medium">ยังไม่มีรูปภาพประกอบ</p></div>}
  </section>
);

export const BriefingModal = ({ briefing, onClose, onSaved, allUsers = [] }) => {
  const { user } = useAuth();
  const isAdmin = user?.Role === 'Admin';
  const creator = allUsers.find((item) => String(item.ID) === String(briefing?.CreatorID));
  const isDepartmentHead = user?.Role === 'Head' && creator?.Department === user?.Department;
  const isCreator = !briefing || isBriefingCreator(briefing, user?.ID);
  const isAssignee = isBriefingAssignee(briefing, user?.ID);
  // An assignee may only update their own delivery response.  Even when that
  // person also has an administrative role, the assigning person's brief must
  // stay read-only in this workflow.
  const canEditBrief = !briefing || canEditBriefingContent({ briefing, userId: user?.ID, isAdmin, isDepartmentHead });
  const canEditStatus = !briefing || canEditBriefingStatus({ briefing, userId: user?.ID, isAdmin });
  const ownsPoints = !briefing || (canEditBrief && isCreator);
  const [fullBriefing, setFullBriefing] = useState(briefing || null);
  // The score can be repicked in any status until the head approves the work.
  const canEditPoints = ownsPoints && !isBriefingScoreLocked(fullBriefing?.Status || briefing?.Status);
  const [responses, setResponses] = useState([]);
  const [reviewNotes, setReviewNotes] = useState([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState(() => isAssignee ? String(user?.ID) : String(briefing?.Assignees?.[0] || ''));
  const [loading, setLoading] = useState(Boolean(briefing?.ID));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [imageSizes, setImageSizes] = useState({});
  const [refImages, setRefImages] = useState(() => getBriefingImages(briefing, 'RefImages', 'RefImage'));
  const [formData, setFormData] = useState({
    Title: briefing?.Title || '', Detail: briefing?.Detail || '', CreatorNote: briefing?.CreatorNote || '', Priority: briefing?.Priority || 'Medium',
    Status: briefing?.Status || 'ดำเนินการ', StartDate: briefing?.StartDate || new Date().toISOString().slice(0, 10), DueDate: briefing?.DueDate || new Date().toISOString().slice(0, 10),
    Assignees: briefing?.Assignees || [], RefURL: briefing?.RefURL || '', CardColor: briefing?.CardColor || '', PostStatus: briefing?.PostStatus || 'ยังไม่โพส',
    PostUrl: briefing?.PostUrl || '', PostDate: briefing?.PostDate || '', Points: briefing?.Points || 0,
  });
  const [myResponse, setMyResponse] = useState({ ResultImages: [], URL1: '', URL2: '', Status: 'ดำเนินการ', Note: '' });
  const selectedResponse = responses.find((item) => String(item.UserID) === String(selectedAssigneeId));
  const selectedAssignee = allUsers.find((item) => String(item.ID) === String(selectedAssigneeId));

  const loadData = useCallback(async () => {
    if (!briefing?.ID) return;
    setLoading(true);
    try {
      // The review history is extra context, never a reason to fail the modal:
      // an older database without the table still shows the briefing itself.
      const [loadedBriefing, loadedResponses, loadedHistory] = await Promise.all([
        apiService.getBriefingById(briefing.ID),
        apiService.getBriefingResponses(briefing.ID),
        apiService.getBriefingReviewHistory(briefing.ID).catch(() => []),
      ]);
      setFullBriefing(loadedBriefing); setResponses(loadedResponses || []);
      setReviewNotes(summarizeReviewNotes(loadedHistory, allUsers));
      setFormData({ Title: loadedBriefing.Title || '', Detail: loadedBriefing.Detail || '', CreatorNote: loadedBriefing.CreatorNote || '', Priority: loadedBriefing.Priority || 'Medium', Status: loadedBriefing.Status || 'ดำเนินการ', StartDate: loadedBriefing.StartDate || '', DueDate: loadedBriefing.DueDate || '', Assignees: loadedBriefing.Assignees || [], RefURL: loadedBriefing.RefURL || '', CardColor: loadedBriefing.CardColor || '', PostStatus: loadedBriefing.PostStatus || 'ยังไม่โพส', PostUrl: loadedBriefing.PostUrl || '', PostDate: loadedBriefing.PostDate || '', Points: loadedBriefing.Points || 0 });
      setRefImages(getBriefingImages(loadedBriefing, 'RefImages', 'RefImage'));
      const ownResponse = (loadedResponses || []).find((item) => String(item.UserID) === String(user?.ID));
      if (ownResponse && isAssignee) { setSelectedAssigneeId(String(user?.ID)); setMyResponse({ ResultImages: getBriefingImages(ownResponse, 'ResultImages', 'ResultImage'), URL1: ownResponse.URL1 || '', URL2: ownResponse.URL2 || '', Status: ownResponse.Status || 'ดำเนินการ', Note: ownResponse.Note || '' }); }
      else if (isAssignee) setSelectedAssigneeId(String(user?.ID));
      else if (loadedBriefing.Assignees?.length) setSelectedAssigneeId(String(loadedBriefing.Assignees[0]));
    } catch (error) { toast.error(`ไม่สามารถโหลดรายละเอียดบรีฟ: ${error.message}`, { position: 'bottom-right' }); }
    finally { setLoading(false); }
  }, [allUsers, briefing?.ID, isAssignee, user?.ID]);
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const onRealtimeUpdate = (event) => {
      const incoming = event.detail?.briefing;
      if (!incoming || event.detail?.eventType === 'DELETE' || String(incoming.ID) !== String(briefing?.ID)) return;
      setFullBriefing((current) => ({ ...(current || {}), ...incoming }));
      if (incoming.Status) setFormData((current) => ({ ...current, Status: incoming.Status }));
    };
    window.addEventListener('remote-briefing-update', onRealtimeUpdate);
    return () => window.removeEventListener('remote-briefing-update', onRealtimeUpdate);
  }, [briefing?.ID]);

  const uploadFiles = useCallback(async (files, folder) => {
    const usable = getImageFiles(files);
    if (!usable.length) { toast.error('กรุณาเลือกไฟล์รูปภาพ เช่น JPG, PNG, WebP หรือ HEIC จาก iPhone', { position: 'bottom-right' }); return []; }
    setUploading(true);
    try {
      const compressed = await Promise.all(usable.map((file) => compressImageDetails(file)));
      const uploaded = await Promise.all(compressed.map((result) => apiService.uploadImage(result.blob, { folder })));
      setImageSizes((current) => ({ ...current, ...Object.fromEntries(uploaded.map((file, index) => [file.url, compressed[index].sizeBytes])) }));
      return uploaded.map((file) => file.url);
    } catch (error) { toast.error(error.message || 'อัปโหลดรูปภาพไม่สำเร็จ', { position: 'bottom-right' }); return []; }
    finally { setUploading(false); }
  }, []);

  const addReferenceImages = async (event) => { const files = snapshotSelectedFiles(event.currentTarget); if (refImages.length + files.length > MAX_IMAGES) { toast.error(`แนบรูปอ้างอิงได้สูงสุด ${MAX_IMAGES} รูป`, { position: 'bottom-right' }); return; } const images = await uploadFiles(files, 'briefings/reference'); if (images.length) setRefImages((current) => [...current, ...images]); };
  const addResultImages = async (event) => { const files = snapshotSelectedFiles(event.currentTarget); if (myResponse.ResultImages.length + files.length > MAX_IMAGES) { toast.error(`แนบหลักฐานงานได้สูงสุด ${MAX_IMAGES} รูป`, { position: 'bottom-right' }); return; } const images = await uploadFiles(files, 'briefings/result'); if (images.length) setMyResponse((current) => ({ ...current, ResultImages: [...current.ResultImages, ...images] })); };

  const persistMyResponse = () => apiService.saveBriefingResponse({
    BriefingID: briefing.ID,
    UserID: String(user?.ID || ''),
    URL1: myResponse.URL1,
    URL2: myResponse.URL2,
    Note: myResponse.Note,
    ResultImages: myResponse.ResultImages,
  });

  const handleSaveBriefing = async () => {
    if (saving || uploading) return;
    if (!formData.Title.trim() || !formData.Detail.trim()) { toast.error('กรุณาระบุชื่อและรายละเอียดงาน', { position: 'bottom-right' }); return; }
    const pointsError = canEditPoints ? getBriefingPointsError(formData.Points) : '';
    if (pointsError) { toast.error(pointsError, { position: 'bottom-right' }); return; }
    setSaving(true);
    try {
      const payload = { ...formData, RefImages: refImages };
      if (briefing?.ID && !canEditPoints) delete payload.Points;
      if (briefing?.ID) await apiService.updateBriefing({ ...payload, ID: briefing.ID });
      else await apiService.addBriefing(payload);
      toast.success('บันทึกบรีฟงานเรียบร้อย', { position: 'bottom-right' });
      onSaved();
    }
    catch (error) { toast.error(`บันทึกไม่สำเร็จ: ${error.message}`, { position: 'bottom-right' }); }
    finally { setSaving(false); }
  };

  const handleSaveResponse = async () => {
    if (!briefing?.ID || saving || uploading) return;
    setSaving(true);
    try {
      await persistMyResponse();
      toast.success('บันทึกรูป ลิงก์ และหมายเหตุการส่งงานเรียบร้อย', { position: 'bottom-right' }); await loadData(); onSaved();
    } catch (error) { toast.error(`บันทึกไม่สำเร็จ: ${error.message}`, { position: 'bottom-right' }); }
    finally { setSaving(false); }
  };

  const assigneeOptions = useMemo(() => allUsers.filter((item) => item.Role !== 'Admin').map((item) => ({ value: String(item.ID), label: `${item.Name || item.Username} · ${item.Department || 'ไม่ระบุแผนก'}` })), [allUsers]);
  const pointsAfterDeduction = Math.max(0, Number(fullBriefing?.Points ?? formData.Points ?? 0) - Number(fullBriefing?.DeductedPoints || 0));
  const recipientSystemStatus = fullBriefing?.Status || formData.Status || 'ดำเนินการ';

  return <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true">
    <div className="flex h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50 via-white to-violet-50 px-4 py-4 sm:px-6"><div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><span className="rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-black tracking-wider text-white">{briefing?.RunningID || 'สร้างบรีฟใหม่'}</span>{briefing && <StatusPill status={fullBriefing?.Status || briefing.Status} />}</div><h2 className="truncate text-lg font-black text-slate-900 sm:text-xl">{briefing ? 'รายละเอียดบรีฟงาน' : 'สร้างบรีฟงานใหม่'}</h2>{fullBriefing?.Status === 'ส่งตรวจ' && <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-fuchsia-700"><ClipboardCheck size={14} /> ส่งเข้าคิวตรวจหัวหน้าแผนกแล้ว</p>}</div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-900" aria-label="ปิด"><X size={22} /></button></header>
      {loading ? <div className="flex flex-1 items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" size={20} /> กำลังโหลดรายละเอียด…</div> : <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
        <section className="min-w-0 space-y-5"><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-black text-slate-800">ข้อมูลงานที่บรีฟ</h3>{briefing && <ScoreSummary briefing={fullBriefing || briefing} finalPoints={pointsAfterDeduction} />}</div><div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2"><FieldLabel text="ชื่องาน" /><input value={formData.Title} disabled={!canEditBrief} onChange={(event) => setFormData((current) => ({ ...current, Title: event.target.value }))} className="field" placeholder="ระบุชื่องานให้ค้นหาและเข้าใจง่าย" /></label>
          <label className="block sm:col-span-2"><FieldLabel text="รายละเอียดงาน" /><textarea value={formData.Detail} disabled={!canEditBrief} onChange={(event) => setFormData((current) => ({ ...current, Detail: event.target.value }))} className="field min-h-32 resize-y" placeholder="ขอบเขตงาน เงื่อนไข และผลลัพธ์ที่ต้องการ" /></label>
          <label className="block sm:col-span-2"><FieldLabel text="หมายเหตุผู้มอบหมาย" optional /><textarea value={formData.CreatorNote} disabled={!canEditBrief} onChange={(event) => setFormData((current) => ({ ...current, CreatorNote: event.target.value }))} className="field min-h-20 resize-y" placeholder="ข้อมูลเพิ่มเติมสำหรับผู้รับงาน" /></label>
          <label className="block"><FieldLabel text="วันเริ่มต้น" /><input type="date" value={formData.StartDate} disabled={!canEditBrief} onChange={(event) => setFormData((current) => ({ ...current, StartDate: event.target.value }))} className="field" /></label><label className="block"><FieldLabel text="วันสิ้นสุด" /><input type="date" value={formData.DueDate} disabled={!canEditBrief} onChange={(event) => setFormData((current) => ({ ...current, DueDate: event.target.value }))} className="field" /></label>
          <div><FieldLabel text="ระดับความสำคัญ" /><CustomSelect value={formData.Priority} onChange={(Priority) => setFormData((current) => ({ ...current, Priority }))} options={[{ value: 'High', label: 'สูง' }, { value: 'Medium', label: 'กลาง' }, { value: 'Low', label: 'ต่ำ' }]} disabled={!canEditBrief} className={canEditBrief ? '' : 'opacity-60'} /></div><div><FieldLabel text="สถานะภาพรวม" /><CustomSelect value={formData.Status} onChange={(Status) => setFormData((current) => ({ ...current, Status }))} options={[...new Set([formData.Status, ...ASSIGNER_STATUSES])].filter((status) => status !== 'เสร็จสิ้น').map((status) => ({ value: status, label: status }))} disabled={!canEditStatus} className={canEditStatus ? '' : 'opacity-60'} /></div>
          <div><span className="mb-1.5 block text-xs font-black text-slate-700">คะแนนตั้งต้น <span className="text-rose-600">*</span><small className="ml-1 font-semibold text-slate-500">{canEditPoints ? 'เลือก 1 / 4 / 8' : ownsPoints ? 'ล็อกหลังหัวหน้าอนุมัติเสร็จสิ้น' : 'เลือก 1 / 4 / 8'}</small></span><CustomSelect value={Number(formData.Points) > 0 ? String(formData.Points) : ''} placeholder="เลือกคะแนนงาน" onChange={(value) => setFormData((current) => ({ ...current, Points: Number(value) || 0 }))} options={getBriefingPointOptions(formData.Points)} disabled={!canEditPoints} className={canEditPoints ? '' : 'opacity-60'} /></div><ReferenceLinkField value={formData.RefURL} editable={canEditBrief} onChange={(event) => setFormData((current) => ({ ...current, RefURL: event.target.value }))} />
        </div><div className="mt-5"><FieldLabel text="ผู้รับมอบหมาย" />{canEditBrief && <CustomSelect value="" placeholder="เพิ่มผู้รับผิดชอบ" searchable options={assigneeOptions.filter((option) => !formData.Assignees.some((id) => String(id) === option.value))} onChange={(id) => id && setFormData((current) => ({ ...current, Assignees: [...current.Assignees, id] }))} />}<div className="mt-2 flex flex-wrap gap-2">{formData.Assignees.length ? formData.Assignees.map((id) => { const person = allUsers.find((item) => String(item.ID) === String(id)); return <span key={id} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"><PersonAvatar person={person} size="h-5 w-5" />{person?.Name || person?.Username || id}{canEditBrief && <button type="button" onClick={() => setFormData((current) => ({ ...current, Assignees: current.Assignees.filter((item) => String(item) !== String(id)) }))} className="ml-1 rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={13} /></button>}</span>; }) : <span className="text-xs text-slate-400">ยังไม่ได้ระบุผู้รับผิดชอบ</span>}</div></div></div><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><ImageGrid label="รูปอ้างอิงจากผู้มอบหมาย" images={refImages} editable={canEditBrief} onRemove={(index) => setRefImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} onPreview={setPreviewImage} onAdd={addReferenceImages} isUploading={uploading} sizes={imageSizes} /></div></section>
        <section className="min-w-0 space-y-5"><ReviewNoteList notes={reviewNotes} /><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-slate-800">การส่งมอบงาน</h3><p className="text-xs text-slate-500">เลือกชื่อเพื่อดูงานของแต่ละผู้รับมอบหมาย</p></div><span className="text-xs text-slate-500">{formData.Assignees.length} คน</span></div><div className="mb-4 flex gap-2 overflow-x-auto pb-1">{formData.Assignees.map((id) => { const person = allUsers.find((item) => String(item.ID) === String(id)); const response = responses.find((item) => String(item.UserID) === String(id)); const selected = String(id) === String(selectedAssigneeId); return <button key={id} type="button" onClick={() => setSelectedAssigneeId(String(id))} className={`flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-bold transition ${selected ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><PersonAvatar person={person} size="h-6 w-6" /><span className="max-w-24 truncate">{person?.Name || person?.Username || id}</span>{response?.Status && <span className="h-2 w-2 rounded-full bg-current opacity-70" />}</button>; })}</div>
          {!selectedAssigneeId ? <EmptyAssignee /> : String(selectedAssigneeId) === String(user?.ID) && isAssignee ? <div className="space-y-5"><ImageGrid label="หลักฐานหรือผลลัพธ์งานของฉัน" images={myResponse.ResultImages} editable onRemove={(index) => setMyResponse((current) => ({ ...current, ResultImages: current.ResultImages.filter((_, itemIndex) => itemIndex !== index) }))} onPreview={setPreviewImage} onAdd={addResultImages} isUploading={uploading} sizes={imageSizes} /><label className="block"><FieldLabel text="ลิงก์ผลงาน 1" optional /><input type="url" value={myResponse.URL1} onChange={(event) => setMyResponse((current) => ({ ...current, URL1: event.target.value }))} className="field" placeholder="https://…" /></label><label className="block"><FieldLabel text="ลิงก์ผลงาน 2" optional /><input type="url" value={myResponse.URL2} onChange={(event) => setMyResponse((current) => ({ ...current, URL2: event.target.value }))} className="field" placeholder="https://…" /></label><label className="block"><FieldLabel text="บันทึกการส่งงาน" optional /><textarea value={myResponse.Note} onChange={(event) => setMyResponse((current) => ({ ...current, Note: event.target.value }))} className="field min-h-28 resize-y" placeholder="สรุปสิ่งที่ทำ ข้อสังเกต หรืองานที่ต้องการให้ตรวจ" /></label><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><FieldLabel text="สถานะงานของฉัน (ระบบกำหนด)" /><StatusPill status={recipientSystemStatus} /><p className="mt-1.5 text-xs text-slate-500">ดูสถานะได้อย่างเดียว ระบบจะแจ้งเมื่อมีการสั่งแก้หรืออัปเดตงาน</p></div>{!canEditBrief && <button type="button" disabled={saving || uploading} onClick={handleSaveResponse} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Send size={17} />{saving ? 'กำลังบันทึก…' : 'บันทึกรายละเอียดการส่งงาน'}</button>}</div> : <SubmittedWork response={selectedResponse} person={selectedAssignee} onPreview={setPreviewImage} />}
        </div>{(isCreator || isAdmin || isDepartmentHead) && <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900"><div className="flex gap-2"><AlertCircle size={18} className="mt-0.5 shrink-0 text-blue-600" /><p><b>การปิดงาน:</b> กด “ส่งตรวจ” เพื่อส่งให้หัวหน้าแผนกหรือผู้ดูแลอนุมัติเท่านั้น งานจะเป็น <b>เสร็จสิ้น</b> หลังได้รับอนุมัติในหน้าตรวจงาน</p></div></div>}</section>
      </div></main>}
      <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100">ปิด</button>{canEditBrief && <button type="button" disabled={saving || uploading} onClick={handleSaveBriefing} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Save size={17} />{saving ? 'กำลังบันทึก…' : 'บันทึกข้อมูลงาน'}</button>}</footer>
    </div>{previewImage && <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/90 p-4" onClick={() => setPreviewImage(null)}><img src={previewImage} alt="ตัวอย่างรูป" className="max-h-full max-w-full rounded-xl object-contain" /><button type="button" className="absolute right-5 top-5 rounded-xl bg-white p-2 text-slate-800" onClick={() => setPreviewImage(null)}><X size={20} /></button></div>}
  </div>;
};

const ScoreSummary = ({ briefing }) => {
  const bonus = getBonusLevelDetails(briefing?.BonusLevel || 'standard', 0);
  return <div className="flex flex-wrap gap-1.5 text-[10px] font-bold"><span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">คะแนน {formatBriefingPoints(briefing?.Points || 0)}</span>{Number(briefing?.DeductedPoints || 0) > 0 && <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">หัก {formatBriefingPoints(briefing.DeductedPoints)}</span>}{briefing?.BonusLevel && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{bonus.label}{Number(briefing?.BonusPoints || 0) > 0 ? ` · +${formatBriefingPoints(briefing.BonusPoints)}` : ''}</span>}{!briefing?.BonusLevel && Number(briefing?.BonusPoints || 0) > 0 && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">พิเศษเดิม +{formatBriefingPoints(briefing.BonusPoints)}</span>}{Number(briefing?.ScoreAdjustment || 0) !== 0 && <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">ปรับ {Number(briefing.ScoreAdjustment) > 0 ? '+' : ''}{formatBriefingPoints(briefing.ScoreAdjustment)}</span>}{briefing?.Status === 'เสร็จสิ้น' && <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">สุทธิ {formatBriefingPoints(getBriefingAwardedPoints(briefing))}</span>}</div>;
};
const NOTE_TONES = {
  orange: 'border-orange-200 bg-orange-50 text-orange-900',
  rose: 'border-rose-200 bg-rose-50 text-rose-900',
  red: 'border-red-300 bg-red-50 text-red-900',
  sky: 'border-sky-200 bg-sky-50 text-sky-900',
  violet: 'border-violet-200 bg-violet-50 text-violet-900',
  slate: 'border-slate-200 bg-slate-50 text-slate-800',
};

/**
 * Every order a department head sends carries a mandatory note. The recipient
 * reads it here, on the briefing itself, instead of only in the review queue.
 */
const ReviewNoteList = ({ notes }) => {
  if (!notes.length) return null;
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-3 flex items-center gap-2"><ClipboardCheck size={17} className="text-fuchsia-600" /><h3 className="font-black text-slate-800">คำสั่งและหมายเหตุจากหัวหน้าแผนก</h3><span className="ml-auto text-xs text-slate-500">{notes.length} รายการ</span></div>
    <ol className="space-y-2">{notes.map((note) => <li key={note.id} className={`rounded-xl border p-3 ${NOTE_TONES[note.tone] || NOTE_TONES.slate}`}>
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black">{note.label}</span>{note.amount && <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold">{note.amount}</span>}<span className="ml-auto text-[10px] opacity-70">{note.createdAt ? new Date(note.createdAt).toLocaleString('th-TH') : ''}</span></div>
      {note.comment && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">{note.comment}</p>}
      <p className="mt-1 text-[10px] opacity-70">โดย {note.reviewer}</p>
    </li>)}</ol>
  </div>;
};

const EmptyAssignee = () =><div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 text-center text-slate-400"><UserRound size={28} className="mb-2" /><p className="text-sm font-bold">ยังไม่มีผู้รับมอบหมาย</p></div>;
const SubmittedWork = ({ response, person, onPreview }) => {
  if (!response) return <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 text-center text-slate-400"><UploadCloud size={28} className="mb-2" /><p className="text-sm font-bold">{person?.Name || 'ผู้รับงาน'} ยังไม่ได้ส่งความคืบหน้า</p></div>;
  const images = getBriefingImages(response, 'ResultImages', 'ResultImage');
  return <div className="space-y-4"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><PersonAvatar person={person} /><span className="text-sm font-black text-slate-800">{person?.Name || person?.Username || 'ผู้รับงาน'}</span></div><StatusPill status={response.Status} /></div>{response.Note && <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm whitespace-pre-wrap text-slate-700">{response.Note}</div>}{(response.URL1 || response.URL2) && <div className="space-y-2">{[response.URL1, response.URL2].filter(Boolean).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"><LinkIcon size={14} /><span className="truncate">{url}</span><ExternalLink size={13} className="ml-auto shrink-0" /></a>)}</div>}{images.length > 0 && <ImageGrid label="หลักฐานที่ส่ง" images={images} editable={false} onPreview={onPreview} sizes={{}} />}</div>;
};
