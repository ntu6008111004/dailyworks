import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Award, CheckCircle2, ChevronRight, ClipboardCheck, Loader2, MessageSquareWarning, RefreshCw, RotateCcw, Save, Search, Settings2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';
import { getBriefingImages } from '../utils/briefingImages';
import {
  BONUS_LEVEL_OPTIONS,
  formatBriefingPoints,
  getBonusLevelDetails,
  getBriefingAwardedPoints,
  getScoreAdjustmentPreview,
} from '../utils/briefingScore';

const REVIEW_STATUSES = ['ส่งตรวจ', 'สั่งแก้ไข', 'รอตรวจ'];
const STATUS_STYLE = {
  'ส่งตรวจ': 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  'สั่งแก้ไข': 'bg-orange-50 text-orange-700 border-orange-200',
  'รอตรวจ': 'bg-amber-50 text-amber-700 border-amber-200',
  'เสร็จสิ้น': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const Avatar = ({ person, className = 'h-9 w-9' }) => person?.ProfileImage ? <img src={person.ProfileImage} alt="" className={`${className} rounded-full border border-white object-cover shadow-sm`} /> : <span className={`${className} flex items-center justify-center rounded-full bg-slate-100 font-black text-slate-600`}>{(person?.Name || person?.Username || 'U').slice(0, 1).toUpperCase()}</span>;
const Pill = ({ status }) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${STATUS_STYLE[status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>{status}</span>;

export const BriefingReview = () => {
  const { user } = useAuth();
  const isAdmin = user?.Role === 'Admin';
  const isHead = user?.Role === 'Head';
  const [briefings, setBriefings] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState('ส่งตรวจ');
  const [department, setDepartment] = useState(isAdmin ? 'All' : user?.Department || '');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [settings, setSettings] = useState({ CorrectionDeduction: 1, RejectedDeduction: 1 });
  const [savingSettings, setSavingSettings] = useState(false);

  const departments = useMemo(() => ['All', ...new Set(users.map((item) => item.Department).filter(Boolean))].filter((item, index, list) => list.indexOf(item) === index).sort(), [users]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [briefingRows, userRows] = await Promise.all([apiService.getBriefingsNoCache(), apiService.getUsers({ includeImage: true })]);
      setBriefings(briefingRows || []); setUsers(userRows || []);
    } catch (error) { toast.error(`ไม่สามารถโหลดคิวตรวจงาน: ${error.message}`, { position: 'bottom-right' }); }
    finally { if (!quiet) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const settingDepartment = department === 'All' ? '' : department;
  useEffect(() => {
    if (!settingDepartment) return;
    apiService.getBriefingReviewSettings(settingDepartment).then(setSettings).catch((error) => toast.error(`ไม่สามารถโหลดการหักคะแนน: ${error.message}`));
  }, [settingDepartment]);

  const visibleBriefings = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return briefings.filter((briefing) => {
      const creator = users.find((item) => String(item.ID) === String(briefing.CreatorID));
      const creatorDept = creator?.Department || '';
      if (!isAdmin && creatorDept !== user?.Department) return false;
      if (isAdmin && department !== 'All' && creatorDept !== department) return false;
      const belongsToWorkflow = REVIEW_STATUSES.includes(briefing.Status) || Boolean(briefing.ReviewSubmittedAt || briefing.ReviewedAt);
      if (!belongsToWorkflow) return false;
      if (filterStatus !== 'All' && briefing.Status !== filterStatus) return false;
      if (keyword && ![briefing.RunningID, briefing.Title, briefing.Detail, creator?.Name].filter(Boolean).join(' ').toLowerCase().includes(keyword)) return false;
      const date = String(briefing.ReviewSubmittedAt || briefing.UpdatedAt || briefing.CreatedAt || '').slice(0, 10);
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
      return true;
    }).sort((left, right) => new Date(right.ReviewSubmittedAt || right.UpdatedAt || right.CreatedAt) - new Date(left.ReviewSubmittedAt || left.UpdatedAt || left.CreatedAt));
  }, [briefings, users, isAdmin, user?.Department, department, filterStatus, search, startDate, endDate]);

  const stats = useMemo(() => ({
    submitted: visibleBriefings.filter((item) => item.Status === 'ส่งตรวจ').length,
    revision: visibleBriefings.filter((item) => item.Status === 'สั่งแก้ไข').length,
    waiting: visibleBriefings.filter((item) => item.Status === 'รอตรวจ').length,
  }), [visibleBriefings]);

  const saveSettings = async () => {
    if (!settingDepartment) { toast.error('กรุณาเลือกแผนกก่อนตั้งค่าการหักคะแนน'); return; }
    setSavingSettings(true);
    try {
      const saved = await apiService.saveBriefingReviewSettings({ Department: settingDepartment, ...settings });
      setSettings(saved); toast.success('บันทึกค่าเริ่มต้นการหักคะแนนแล้ว');
    } catch (error) { toast.error(`บันทึกไม่สำเร็จ: ${error.message}`); }
    finally { setSavingSettings(false); }
  };

  if (!isAdmin && !isHead) return <div className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-900"><AlertTriangle className="mx-auto mb-3" /><h1 className="font-black">ไม่มีสิทธิ์เข้าหน้าตรวจงาน</h1><p className="mt-1 text-sm">หน้านี้สำหรับหัวหน้าแผนกและผู้ดูแลระบบเท่านั้น</p></div>;

  return <div className="space-y-6 pb-8">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-fuchsia-100 bg-fuchsia-50 px-3 py-1 text-xs font-black text-fuchsia-700"><ClipboardCheck size={14} /> หัวหน้าแผนก / ผู้ดูแลระบบ</div><h1 className="text-2xl font-black text-slate-900 sm:text-3xl">ตรวจและอนุมัติบรีฟงาน</h1><p className="mt-1 text-sm text-slate-500">ตรวจรายละเอียด ผู้มอบหมาย ผู้รับงาน หลักฐาน คะแนน และส่งคำแนะนำกลับได้ในที่เดียว</p></div><button onClick={() => load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />รีเฟรชคิว</button></header>

    <div className="grid gap-3 sm:grid-cols-3"><QueueStat label="รออนุมัติ" value={stats.submitted} color="fuchsia" icon={<ClipboardCheck size={19} />} onClick={() => setFilterStatus('ส่งตรวจ')} active={filterStatus === 'ส่งตรวจ'} /><QueueStat label="สั่งแก้ไข" value={stats.revision} color="orange" icon={<MessageSquareWarning size={19} />} onClick={() => setFilterStatus('สั่งแก้ไข')} active={filterStatus === 'สั่งแก้ไข'} /><QueueStat label="รอตรวจ" value={stats.waiting} color="amber" icon={<AlertTriangle size={19} />} onClick={() => setFilterStatus('รอตรวจ')} active={filterStatus === 'รอตรวจ'} /></div>

    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Search size={17} className="shrink-0 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none" placeholder="ค้นหารหัส ชื่องาน รายละเอียด หรือผู้มอบหมาย" /></div><div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"><CustomSelect value={filterStatus} onChange={setFilterStatus} options={[{ value: 'ส่งตรวจ', label: 'ส่งตรวจ' }, { value: 'สั่งแก้ไข', label: 'สั่งแก้ไข' }, { value: 'รอตรวจ', label: 'รอตรวจ' }, { value: 'เสร็จสิ้น', label: 'งานที่เสร็จแล้ว' }, { value: 'All', label: 'ทุกสถานะ' }]} className="min-w-36" />{isAdmin && <CustomSelect value={department} onChange={setDepartment} options={departments.map((item) => ({ value: item, label: item === 'All' ? 'ทุกแผนก' : item }))} className="min-w-36" />}<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs" /><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs" /></div>{(search || filterStatus !== 'ส่งตรวจ' || startDate || endDate || (isAdmin && department !== 'All')) && <button onClick={() => { setSearch(''); setFilterStatus('ส่งตรวจ'); setStartDate(''); setEndDate(''); if (isAdmin) setDepartment('All'); }} className="inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100"><RotateCcw size={14} />ล้าง</button>}</div></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center gap-2"><Settings2 size={18} className="text-slate-500" /><div><h2 className="font-black text-slate-800">ค่าเริ่มต้นการหักคะแนน</h2><p className="text-xs text-slate-500">ใช้กับแผนก {settingDepartment || 'ที่เลือก'} ในการกดสั่งแก้ไขหรือระบุข้อผิดพลาดครั้งถัดไป</p></div></div><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><label><span className="mb-1 block text-xs font-bold text-slate-600">สั่งแก้ไข / ครั้ง</span><input min="0" type="number" value={settings.CorrectionDeduction ?? 1} onChange={(event) => setSettings((current) => ({ ...current, CorrectionDeduction: Math.max(0, Number(event.target.value) || 0) }))} className="review-field" /></label><label><span className="mb-1 block text-xs font-bold text-slate-600">พบข้อผิดพลาด / ครั้ง</span><input min="0" type="number" value={settings.RejectedDeduction ?? 1} onChange={(event) => setSettings((current) => ({ ...current, RejectedDeduction: Math.max(0, Number(event.target.value) || 0) }))} className="review-field" /></label><button onClick={saveSettings} disabled={savingSettings || !settingDepartment} className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"><Save size={16} />{savingSettings ? 'กำลังบันทึก…' : 'บันทึกค่า'}</button></div></section>

    {loading ? <div className="flex min-h-64 items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" />กำลังโหลดคิวตรวจงาน…</div> : visibleBriefings.length ? <div className="grid gap-4 xl:grid-cols-2">{visibleBriefings.map((briefing) => <ReviewCard key={briefing.ID} briefing={briefing} users={users} onClick={() => setSelected(briefing)} />)}</div> : <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-center text-slate-400"><ClipboardCheck size={34} className="mb-3" /><h2 className="font-black text-slate-600">ไม่มีงานในคิวที่เลือก</h2><p className="mt-1 text-sm">เมื่องานถูกส่งตรวจ จะปรากฏในหน้านี้ทันที</p></div>}
    {selected && <ReviewDialog briefing={selected} users={users} onClose={() => setSelected(null)} onChanged={async () => { setSelected(null); await load(true); }} />}
  </div>;
};

const QueueStat = ({ label, value, color, icon, onClick, active }) => {
  const palette = {
    fuchsia: { active: 'border-fuchsia-300 bg-fuchsia-50 ring-2 ring-fuchsia-100', icon: 'bg-fuchsia-100 text-fuchsia-700' },
    orange: { active: 'border-orange-300 bg-orange-50 ring-2 ring-orange-100', icon: 'bg-orange-100 text-orange-700' },
    amber: { active: 'border-amber-300 bg-amber-50 ring-2 ring-amber-100', icon: 'bg-amber-100 text-amber-700' },
  };
  const style = palette[color] || palette.fuchsia;
  return <button onClick={onClick} className={`flex items-center justify-between rounded-2xl border p-4 text-left shadow-sm transition ${active ? style.active : 'border-slate-200 bg-white hover:bg-slate-50'}`}><span><span className="block text-xs font-bold text-slate-500">{label}</span><span className="mt-1 block text-3xl font-black text-slate-800">{value}</span></span><span className={`rounded-xl p-2 ${style.icon}`}>{icon}</span></button>;
};

const ReviewCard = ({ briefing, users, onClick }) => {
  const creator = users.find((item) => String(item.ID) === String(briefing.CreatorID));
  const assignees = (briefing.Assignees || []).map((id) => users.find((item) => String(item.ID) === String(id))).filter(Boolean);
  const remaining = Math.max(0, Number(briefing.Points || 0) - Number(briefing.DeductedPoints || 0));
  return <button onClick={onClick} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{briefing.RunningID}</span><Pill status={briefing.Status} /></div><h2 className="line-clamp-2 text-base font-black text-slate-900 group-hover:text-blue-700">{briefing.Title || briefing.Detail}</h2><p className="mt-1 line-clamp-2 text-sm text-slate-500">{briefing.Detail}</p></div><ChevronRight className="mt-5 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-500" /></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><Metric label="คะแนนตั้งต้น" value={briefing.Points || 0} /><Metric label="คงเหลือ" value={remaining} /><Metric label="สั่งแก้" value={`${briefing.CorrectionCount || 0} ครั้ง`} /><Metric label="ผิด" value={`${briefing.RejectedCount || 0} ครั้ง`} /></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><div className="flex min-w-0 items-center gap-2"><Avatar person={creator} className="h-7 w-7" /><div className="min-w-0"><p className="truncate text-xs font-black text-slate-700">ผู้มอบหมาย: {creator?.Name || creator?.Username || '-'}</p><p className="text-[10px] text-slate-400">{creator?.Department || 'ไม่ระบุแผนก'}</p></div></div><div className="flex -space-x-2">{assignees.slice(0, 4).map((person) => <Avatar key={person.ID} person={person} className="h-7 w-7 border-2 border-white" />)}{assignees.length > 4 && <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[10px] font-black text-slate-600">+{assignees.length - 4}</span>}</div></div></button>;
};
const Metric = ({ label, value }) => <div className="rounded-xl bg-slate-50 px-2.5 py-2"><p className="text-[10px] font-bold text-slate-400">{label}</p><p className="mt-0.5 truncate font-black text-slate-700">{value}</p></div>;

const ReviewDialog = ({ briefing, users, onClose, onChanged }) => {
  const [detail, setDetail] = useState(null); const [responses, setResponses] = useState([]); const [history, setHistory] = useState([]); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [comment, setComment] = useState(''); const [bonusLevel, setBonusLevel] = useState(briefing.BonusLevel || 'standard'); const [targetPoints, setTargetPoints] = useState(getBriefingAwardedPoints(briefing)); const [preview, setPreview] = useState(null);
  const load = useCallback(async () => { setLoading(true); try { const [briefingData, responseData, historyData] = await Promise.all([apiService.getBriefingById(briefing.ID), apiService.getBriefingResponses(briefing.ID), apiService.getBriefingReviewHistory(briefing.ID)]); setDetail(briefingData); setResponses(responseData || []); setHistory(historyData || []); setBonusLevel(briefingData.BonusLevel || 'standard'); setTargetPoints(getBriefingAwardedPoints(briefingData)); } catch (error) { toast.error(`ไม่สามารถโหลดงานตรวจ: ${error.message}`); } finally { setLoading(false); } }, [briefing.ID]);
  useEffect(() => { load(); }, [load]);
  const creator = users.find((item) => String(item.ID) === String((detail || briefing).CreatorID));
  const remaining = Math.max(0, Number(detail?.Points || 0) - Number(detail?.DeductedPoints || 0));
  const bonusPreview = getBonusLevelDetails(bonusLevel, remaining);
  const action = async (type) => { if ((type === 'needs_revision' || type === 'rejected') && !comment.trim()) { toast.error('กรุณาระบุสิ่งที่ต้องแก้ไขหรือข้อผิดพลาดก่อน'); return; } setSaving(true); try { await apiService.reviewBriefing({ briefingId: briefing.ID, action: type, comment, bonusLevel: type === 'approved' ? bonusLevel : null }); toast.success(type === 'approved' ? `อนุมัติและปิดงานด้วยระดับ ${bonusPreview.label} เรียบร้อย` : type === 'needs_revision' ? 'ส่งคำสั่งแก้ไขแล้ว' : 'บันทึกข้อผิดพลาดและหักคะแนนแล้ว'); await onChanged(); } catch (error) { toast.error(`ดำเนินการไม่สำเร็จ: ${error.message}`); } finally { setSaving(false); } };
  const saveBonus = async () => { setSaving(true); try { await apiService.reviewBriefing({ briefingId: briefing.ID, action: 'bonus', comment: `ปรับระดับคะแนนพิเศษเป็น ${bonusPreview.label}`, bonusLevel }); toast.success(`บันทึกระดับ ${bonusPreview.label} แล้ว`); await load(); } catch (error) { toast.error(`บันทึกไม่สำเร็จ: ${error.message}`); } finally { setSaving(false); } };
  const scorePreview = getScoreAdjustmentPreview(detail || briefing, targetPoints);
  const saveScoreAdjustment = async () => { if (scorePreview.delta === 0) { toast('คะแนนรวมเท่าเดิม จึงไม่มีคะแนนเพิ่มหรือลด'); return; } setSaving(true); try { await apiService.reviewBriefing({ briefingId: briefing.ID, action: 'score_adjustment', comment: 'ปรับคะแนนหลังปิดงาน', targetPoints: scorePreview.targetPoints }); toast.success(`ปรับคะแนน ${scorePreview.delta > 0 ? '+' : ''}${scorePreview.delta} คะแนนเรียบร้อย`); await load(); } catch (error) { toast.error(`ปรับคะแนนไม่สำเร็จ: ${error.message}`); } finally { setSaving(false); } };
  return <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6"><div className="flex h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-fuchsia-50 via-white to-emerald-50 px-4 py-4 sm:px-6"><div><div className="mb-1 flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-black text-white">{briefing.RunningID}</span><Pill status={detail?.Status || briefing.Status} /></div><h2 className="text-lg font-black text-slate-900 sm:text-xl">ตรวจงาน: {detail?.Title || briefing.Title || briefing.Detail}</h2></div><button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={21} /></button></header>{loading ? <div className="flex flex-1 items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" />กำลังโหลด…</div> : <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,.95fr)]"><section className="min-w-0 space-y-5"><article className="rounded-2xl border border-slate-200 p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Avatar person={creator} /><div><p className="text-xs text-slate-400">ผู้มอบหมายงาน</p><p className="text-sm font-black text-slate-800">{creator?.Name || creator?.Username || '-'}</p></div></div><div className="text-right text-xs text-slate-500"><p>เริ่ม {detail?.StartDate || '-'}</p><p>สิ้นสุด {detail?.DueDate || '-'}</p></div></div><h3 className="text-base font-black text-slate-900">{detail?.Title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{detail?.Detail}</p>{detail?.CreatorNote && <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><b className="block text-xs">หมายเหตุผู้มอบหมาย</b><p className="mt-1 whitespace-pre-wrap">{detail.CreatorNote}</p></div>}</article><article className="rounded-2xl border border-slate-200 p-4 sm:p-5"><h3 className="mb-3 font-black text-slate-800">ผู้รับงานและหลักฐาน</h3><div className="space-y-4">{(detail?.Assignees || []).map((id) => { const person = users.find((item) => String(item.ID) === String(id)); const response = responses.find((item) => String(item.UserID) === String(id)); const images = getBriefingImages(response, 'ResultImages', 'ResultImage'); return <div key={id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Avatar person={person} /><p className="truncate text-sm font-black text-slate-800">{person?.Name || person?.Username || id}</p></div><Pill status={response?.Status || 'ยังไม่ส่ง'} /></div>{response?.Note && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-slate-700">{response.Note}</p>}{images.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{images.map((image, index) => <img key={`${image}-${index}`} onClick={() => setPreview(image)} src={image} alt="หลักฐานงาน" className="aspect-square w-full cursor-zoom-in rounded-lg border border-slate-200 object-cover" />)}</div>}</div>; })}</div></article></section><aside className="space-y-5"><article className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"><h3 className="mb-3 flex items-center gap-2 font-black text-indigo-950"><Award size={18} /> คะแนนงานนี้</h3><div className="grid grid-cols-2 gap-2"><Metric label="ตั้งต้น" value={formatBriefingPoints(detail?.Points || 0)} /><Metric label="ถูกหัก" value={formatBriefingPoints(detail?.DeductedPoints || 0)} /><Metric label="คงเหลือ" value={formatBriefingPoints(remaining)} /><Metric label="โบนัสที่บันทึก" value={'+' + formatBriefingPoints(detail?.BonusPoints || 0)} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><span className="rounded-lg bg-white px-2 py-1.5 text-slate-600">สั่งแก้ {detail?.CorrectionCount || 0} ครั้ง</span><span className="rounded-lg bg-white px-2 py-1.5 text-slate-600">ผิด {detail?.RejectedCount || 0} ครั้ง</span></div><div className="mt-4 border-t border-indigo-100 pt-3"><label className="mb-1 block text-xs font-bold text-indigo-900">ระดับคะแนนพิเศษ</label><div className="flex gap-2"><CustomSelect value={bonusLevel} onChange={setBonusLevel} options={BONUS_LEVEL_OPTIONS} className="min-w-0 flex-1" /><button disabled={saving} onClick={saveBonus} className="rounded-xl bg-indigo-600 px-3 text-xs font-black text-white disabled:opacity-50">บันทึก</button></div><div className="mt-2 rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs text-indigo-900"><p className="font-black">{bonusPreview.label}: {formatBriefingPoints(bonusPreview.basePoints)} → {formatBriefingPoints(bonusPreview.totalPoints)} คะแนน</p><p className="mt-0.5 text-[11px] text-indigo-700">โบนัสเพิ่ม +{formatBriefingPoints(bonusPreview.bonusPoints)} ให้ทั้งผู้มอบหมายและผู้รับงานเมื่ออนุมัติ</p></div></div>{detail?.Status === 'เสร็จสิ้น' && <div className="mt-4 rounded-xl border border-sky-200 bg-white p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-black text-sky-950">ปรับคะแนนหลังปิดงาน</p><p className="mt-0.5 text-[11px] text-sky-800">คำนวณเฉพาะส่วนต่างจากคะแนนเดิม จึงไม่เกิดการบวกซ้ำ</p></div><span className="rounded-lg bg-sky-50 px-2 py-1 text-xs font-black text-sky-700">ปัจจุบัน {scorePreview.currentPoints}</span></div><div className="mt-2 flex gap-2"><input min="0" step="0.5" type="number" value={targetPoints} onChange={(event) => setTargetPoints(event.target.value)} className="review-field flex-1" aria-label="คะแนนรวมใหม่" /><button disabled={saving || scorePreview.delta === 0} onClick={saveScoreAdjustment} className="rounded-xl bg-sky-600 px-3 text-xs font-black text-white disabled:opacity-50">บันทึก {scorePreview.delta > 0 ? '+' : ''}{scorePreview.delta}</button></div><p className="mt-1 text-[11px] text-sky-800">คะแนนเป้าหมาย {scorePreview.targetPoints} · ปรับสะสม {scorePreview.scoreAdjustment > 0 ? '+' : ''}{scorePreview.scoreAdjustment}</p></div>}</article><article className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-2 font-black text-slate-800">ความเห็นผู้ตรวจ</h3><textarea value={comment} onChange={(event) => setComment(event.target.value)} className="review-field min-h-36 resize-y" placeholder="ระบุจุดที่ต้องแก้ไข หรือข้อผิดพลาดให้ชัดเจน…" /><p className="mt-2 text-[11px] text-slate-500">จำเป็นต้องกรอกเมื่อกด “สั่งแก้ไข” หรือ “พบข้อผิดพลาด”</p><div className="mt-4 grid gap-2"><button disabled={saving || detail?.Status === 'เสร็จสิ้น'} onClick={() => action('needs_revision')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white transition hover:bg-orange-600 disabled:opacity-50"><MessageSquareWarning size={17} />สั่งแก้ไข</button><button disabled={saving || detail?.Status === 'เสร็จสิ้น'} onClick={() => action('rejected')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:opacity-50"><AlertTriangle size={17} />พบข้อผิดพลาด</button><button disabled={saving || detail?.Status === 'เสร็จสิ้น'} onClick={() => action('approved')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 size={17} />อนุมัติผ่าน</button></div></article><article className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-3 font-black text-slate-800">ประวัติการตรวจ</h3>{history.length ? <ol className="space-y-3">{history.map((event) => <li key={event.ID} className="border-l-2 border-slate-200 pl-3"><p className="text-xs font-black text-slate-700">{historyLabel(event.Action)} {event.PointsDeducted > 0 && <span className="text-rose-600">−{event.PointsDeducted}</span>}{event.Action === 'BONUS_UPDATED' && <span className="text-indigo-600"> {event.BonusLevel ? getBonusLevelDetails(event.BonusLevel, 0).label : 'คะแนนพิเศษเดิม'} · +{formatBriefingPoints(event.BonusPoints)}</span>}{event.Action === 'SCORE_ADJUSTED' && <span className="text-sky-600"> {event.PointsDelta > 0 ? '+' : ''}{event.PointsDelta}</span>}</p>{event.Comment && <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-500">{event.Comment}</p>}<p className="mt-1 text-[10px] text-slate-400">{new Date(event.CreatedAt).toLocaleString('th-TH')}</p></li>)}</ol> : <p className="text-sm text-slate-400">ยังไม่มีประวัติ</p>}</article></aside></div></main>}{preview && <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/90 p-4" onClick={() => setPreview(null)}><img src={preview} alt="หลักฐานงาน" className="max-h-full max-w-full rounded-xl object-contain" /></div>}</div></div>;
};
const historyLabel = (action) => ({ SUBMITTED: 'ส่งเข้าตรวจ', NEEDS_REVISION: 'สั่งแก้ไข', REJECTED: 'พบข้อผิดพลาด', APPROVED: 'อนุมัติผ่าน', BONUS_UPDATED: 'ปรับคะแนนพิเศษ', SCORE_ADJUSTED: 'ปรับคะแนนหลังปิดงาน' }[action] || action);
