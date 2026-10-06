import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Award, CalendarDays, CalendarPlus, CheckCircle2, ChevronRight, ClipboardCheck,
  ExternalLink, ImagePlus, LayoutGrid, Link as LinkIcon, List, ListPlus, Loader2, MessageSquareWarning,
  RefreshCw, RotateCcw, Save, Search, Send, Settings2, ShieldAlert, Users, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';
import { getBriefingImages, parseStoredImageArray } from '../utils/briefingImages';
import { compressImageDetails, getImageFiles, snapshotSelectedFiles } from '../utils/compressImage';
import { getBriefingReviewParticipants, getOverdueDays, toBangkokDateKey } from '../utils/briefingPointLedger';
import { compareBriefingsForReview } from '../utils/briefingOrder';
import { normalizeExternalLink } from '../utils/externalLinks';
import { MAX_REVIEW_COMMENT_IMAGES, requiresReviewComment } from '../utils/briefingReviewNotes';
import {
  BONUS_LEVEL_OPTIONS,
  formatBriefingPoints,
  getBonusLevelDetails,
  getBriefingAwardedPoints,
  getBriefingMemberScores,
  getBriefingPointOptions,
  getMemberAwardDetails,
  getScoreAdjustmentPreview,
  getUnscoredAssigneeIds,
} from '../utils/briefingScore';
import { formatBangkokDateTime, formatBangkokTime, getLatestSubmission, summarizeBriefingDay } from '../utils/briefingDailySummary';

export { ReviewActions, ReviewTable };

const REVIEW_STATUSES = ['ส่งตรวจ', 'สั่งแก้ไข', 'รอตรวจ', 'สั่งเพิ่มงาน'];
const PRIORITY_META = {
  High: { label: 'สูง', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  Medium: { label: 'กลาง', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  Low: { label: 'ต่ำ', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};
const isReviewOverdue = (briefing) => Boolean(briefing?.DueDate)
  && briefing.Status !== 'เสร็จสิ้น'
  && String(briefing.DueDate) < toBangkokDateKey(Date.now());
const STATUS_STYLE = {
  ส่งตรวจ: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  สั่งแก้ไข: 'bg-orange-50 text-orange-700 border-orange-200',
  รอตรวจ: 'bg-amber-50 text-amber-700 border-amber-200',
  สั่งเพิ่มงาน: 'bg-sky-50 text-sky-700 border-sky-200',
  เสร็จสิ้น: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const Avatar = ({ person, className = 'h-9 w-9' }) => person?.ProfileImage ? (
  <img src={person.ProfileImage} alt="" className={`${className} rounded-full border border-white object-cover shadow-sm`} />
) : (
  <span className={`${className} flex items-center justify-center rounded-full bg-slate-100 font-black text-slate-600`}>
    {(person?.Name || person?.Username || 'U').slice(0, 1).toUpperCase()}
  </span>
);

const Pill = ({ status }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${STATUS_STYLE[status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
    {status}
  </span>
);

const Metric = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 px-2.5 py-2">
    <p className="text-[10px] font-bold text-slate-400">{label}</p>
    <p className="mt-0.5 truncate font-black text-slate-700">{value}</p>
  </div>
);

const uniqueAssignees = (briefing) => (briefing?.Assignees || []).map(String)
  .filter((id, index, list) => list.indexOf(id) === index);

// "2/3 คน" for per-person work; a briefing closed with the old shared score
// shows that score instead.
const getScoreProgress = (briefing, memberScores) => {
  const assignees = uniqueAssignees(briefing);
  const rows = getBriefingMemberScores(memberScores, briefing.ID);
  if (!rows.length && briefing.Status === 'เสร็จสิ้น') {
    return { label: `${formatBriefingPoints(getBriefingAwardedPoints(briefing))} (แบบเดิม)`, done: true };
  }
  const scored = assignees.length - getUnscoredAssigneeIds(briefing, memberScores).length;
  return { label: `${scored}/${assignees.length} คน`, done: assignees.length > 0 && scored === assignees.length };
};

const SubmittedAt = ({ briefing }) => briefing.ReviewSubmittedAt
  ? <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-bold text-fuchsia-700"><Send size={12} />{formatBangkokDateTime(briefing.ReviewSubmittedAt)}</span>
  : <span className="text-[11px] text-slate-400">ยังไม่ส่ง</span>;

export const BriefingReview = () => {
  const { user } = useAuth();
  const isAdmin = user?.Role === 'Admin';
  const isHead = user?.Role === 'Head';
  const [briefings, setBriefings] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState('ส่งตรวจ');
  const [viewMode, setViewMode] = useState(() => { try { return localStorage.getItem('briefing_review_view_mode') || 'card'; } catch { return 'card'; } });
  const switchView = (mode) => { setViewMode(mode); try { localStorage.setItem('briefing_review_view_mode', mode); } catch { /* ignore */ } };
  const [department, setDepartment] = useState(isAdmin ? 'All' : user?.Department || '');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [settings, setSettings] = useState({ CorrectionDeduction: 1, RejectedDeduction: 5, SevereDeduction: 50 });
  const [memberScores, setMemberScores] = useState([]);
  const [filterUser, setFilterUser] = useState('All');
  const [todayKey] = useState(() => toBangkokDateKey(Date.now()));
  const [summaryDate, setSummaryDate] = useState(todayKey);
  const [submissions, setSubmissions] = useState([]);
  const [savingSettings, setSavingSettings] = useState(false);

  const departments = useMemo(
    () => ['All', ...new Set(users.map((item) => item.Department).filter(Boolean))]
      .filter((item, index, list) => list.indexOf(item) === index).sort(),
    [users],
  );

  const load = useCallback(async (quiet = false) => {
    if (!isAdmin && !isHead) return;
    if (!quiet) setLoading(true);
    try {
      const [briefingRows, userRows, scoreRows] = await Promise.all([
        apiService.getBriefingsNoCache(),
        apiService.getUsers({ includeImage: true }),
        apiService.getBriefingMemberScores(),
      ]);
      setBriefings(briefingRows || []);
      setUsers(userRows || []);
      setMemberScores(scoreRows || []);
    } catch (error) {
      toast.error(`ไม่สามารถโหลดคิวตรวจงาน: ${error.message}`, { position: 'bottom-right' });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [isAdmin, isHead]);

  useEffect(() => { load(); }, [load]);

  const loadSubmissions = useCallback(async () => {
    if ((!isAdmin && !isHead) || !summaryDate) return;
    try {
      setSubmissions(await apiService.getBriefingSubmissions({ startDate: summaryDate, endDate: summaryDate }));
    } catch (error) {
      console.warn('[BriefingReview] submissions unavailable', error);
      setSubmissions([]);
    }
  }, [isAdmin, isHead, summaryDate]);
  useEffect(() => { loadSubmissions(); }, [loadSubmissions]);

  const settingDepartment = department === 'All' ? '' : department;
  useEffect(() => {
    if (!settingDepartment) return;
    apiService.getBriefingReviewSettings(settingDepartment)
      .then(setSettings)
      .catch((error) => toast.error(`ไม่สามารถโหลดการหักคะแนน: ${error.message}`));
  }, [settingDepartment]);

  // Briefings this reviewer is responsible for: their department's (by the
  // briefer's department), or the selected department for an admin.
  const scopedBriefings = useMemo(() => briefings.filter((briefing) => {
    const creator = users.find((item) => String(item.ID) === String(briefing.CreatorID));
    const creatorDept = creator?.Department || '';
    if (!isAdmin && creatorDept !== user?.Department) return false;
    if (isAdmin && department !== 'All' && creatorDept !== department) return false;
    return true;
  }), [briefings, users, isAdmin, user?.Department, department]);

  const userOptions = useMemo(() => {
    const ids = new Set();
    scopedBriefings.forEach((briefing) => { ids.add(String(briefing.CreatorID)); (briefing.Assignees || []).forEach((id) => ids.add(String(id))); });
    const people = users.filter((item) => ids.has(String(item.ID)))
      .sort((left, right) => String(left.Name || left.Username).localeCompare(String(right.Name || right.Username), 'th'));
    return [{ value: 'All', label: 'ทุกคน' }, ...people.map((item) => ({ value: String(item.ID), label: item.Name || item.Username }))];
  }, [scopedBriefings, users]);

  const daySummary = useMemo(() => summarizeBriefingDay({
    briefings: scopedBriefings,
    submissions,
    dateKey: summaryDate,
    userIds: filterUser === 'All' ? null : [filterUser],
  }), [scopedBriefings, submissions, summaryDate, filterUser]);

  const visibleBriefings = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return scopedBriefings.filter((briefing) => {
      const creator = users.find((item) => String(item.ID) === String(briefing.CreatorID));
      if (filterUser !== 'All' && String(briefing.CreatorID) !== String(filterUser)
        && !(briefing.Assignees || []).some((id) => String(id) === String(filterUser))) return false;
      if (!REVIEW_STATUSES.includes(briefing.Status) && !briefing.ReviewSubmittedAt && !briefing.ReviewedAt) return false;
      if (filterStatus !== 'All' && briefing.Status !== filterStatus) return false;
      if (keyword && ![briefing.RunningID, briefing.Title, briefing.Detail, creator?.Name]
        .filter(Boolean).join(' ').toLowerCase().includes(keyword)) return false;
      const date = String(briefing.ReviewSubmittedAt || briefing.UpdatedAt || briefing.CreatedAt || '').slice(0, 10);
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
      return true;
    }).sort(compareBriefingsForReview);
  }, [scopedBriefings, users, filterUser, filterStatus, search, startDate, endDate]);

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
      setSettings(saved);
      toast.success('บันทึกมาตรฐานการหักคะแนนแล้ว');
    } catch (error) {
      toast.error(`บันทึกไม่สำเร็จ: ${error.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  if (!isAdmin && !isHead) return (
    <div className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-900">
      <AlertTriangle className="mx-auto mb-3" />
      <h1 className="font-black">ไม่มีสิทธิ์เข้าหน้าตรวจงาน</h1>
      <p className="mt-1 text-sm">หน้านี้สำหรับหัวหน้าแผนกและผู้ดูแลระบบเท่านั้น</p>
    </div>
  );

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-fuchsia-100 bg-fuchsia-50 px-3 py-1 text-xs font-black text-fuchsia-700"><ClipboardCheck size={14} /> หัวหน้าแผนก / ผู้ดูแลระบบ</div>
          <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">ตรวจและอนุมัติบรีฟงาน</h1>
          <p className="mt-1 text-sm text-slate-500">ตรวจหลักฐาน หักคะแนนรายงานหรือรายเดือน ขยายเวลา และสั่งเพิ่มงานได้ในที่เดียว</p>
        </div>
        <button onClick={() => load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />รีเฟรชคิว</button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <QueueStat label="รออนุมัติ" value={stats.submitted} color="fuchsia" icon={<ClipboardCheck size={19} />} onClick={() => setFilterStatus('ส่งตรวจ')} active={filterStatus === 'ส่งตรวจ'} />
        <QueueStat label="สั่งแก้ไข" value={stats.revision} color="orange" icon={<MessageSquareWarning size={19} />} onClick={() => setFilterStatus('สั่งแก้ไข')} active={filterStatus === 'สั่งแก้ไข'} />
        <QueueStat label="รอตรวจ" value={stats.waiting} color="amber" icon={<AlertTriangle size={19} />} onClick={() => setFilterStatus('รอตรวจ')} active={filterStatus === 'รอตรวจ'} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Search size={17} className="shrink-0 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full bg-transparent py-2.5 text-sm outline-none" placeholder="ค้นหารหัส ชื่องาน รายละเอียด หรือผู้มอบหมาย" /></div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <CustomSelect value={filterStatus} onChange={setFilterStatus} options={[
              { value: 'ส่งตรวจ', label: 'ส่งตรวจ' }, { value: 'รอตรวจ', label: 'รอตรวจ' },
              { value: 'สั่งแก้ไข', label: 'สั่งแก้ไข' }, { value: 'สั่งเพิ่มงาน', label: 'สั่งเพิ่มงาน' },
              { value: 'เสร็จสิ้น', label: 'งานที่เสร็จแล้ว' }, { value: 'All', label: 'ทุกสถานะ' },
            ]} className="min-w-36" />
            <CustomSelect value={filterUser} onChange={setFilterUser} options={userOptions} searchable className="min-w-40" />
            {isAdmin && <CustomSelect value={department} onChange={setDepartment} options={departments.map((item) => ({ value: item, label: item === 'All' ? 'ทุกแผนก' : item }))} className="min-w-36" />}
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs" />
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs" />
          </div>
          {(search || filterStatus !== 'ส่งตรวจ' || startDate || endDate || filterUser !== 'All' || (isAdmin && department !== 'All')) && <button onClick={() => { setSearch(''); setFilterStatus('ส่งตรวจ'); setStartDate(''); setEndDate(''); setFilterUser('All'); if (isAdmin) setDepartment('All'); }} className="inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100"><RotateCcw size={14} />ล้าง</button>}<div className="flex shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-0.5"><button type="button" onClick={() => switchView('card')} aria-label="มุมมองการ์ด" className={`rounded-lg px-2.5 py-1.5 ${viewMode === 'card' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={15} /></button><button type="button" onClick={() => switchView('table')} aria-label="มุมมองตาราง" className={`rounded-lg px-2.5 py-1.5 ${viewMode === 'table' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><List size={15} /></button></div>
        </div>
      </section>

      <DailySummary rows={daySummary} users={users} today={todayKey} date={summaryDate} onDateChange={setSummaryDate} onSelect={setSelected} />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-2"><Settings2 size={18} className="text-slate-500" /><div><h2 className="font-black text-slate-800">มาตรฐานการหักคะแนน</h2><p className="text-xs text-slate-500">หัวหน้าแก้ได้ตลอดสำหรับแผนก {settingDepartment || 'ที่เลือก'}</p></div></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
          <SettingInput label="สั่งแก้ไข / ครั้ง (หัก Task)" value={settings.CorrectionDeduction ?? 1} onChange={(CorrectionDeduction) => setSettings((current) => ({ ...current, CorrectionDeduction }))} />
          <SettingInput label="ความผิดพลาด (หักรายเดือน)" value={settings.RejectedDeduction ?? 5} onChange={(RejectedDeduction) => setSettings((current) => ({ ...current, RejectedDeduction }))} />
          <SettingInput label="ร้ายแรง (หักรายเดือน)" value={settings.SevereDeduction ?? 50} onChange={(SevereDeduction) => setSettings((current) => ({ ...current, SevereDeduction }))} />
          <button onClick={saveSettings} disabled={savingSettings || !settingDepartment} className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-900 disabled:opacity-50"><Save size={16} />{savingSettings ? 'กำลังบันทึก…' : 'บันทึกค่า'}</button>
        </div>
      </section>

      {loading ? <div className="flex min-h-64 items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" />กำลังโหลดคิวตรวจงาน…</div> : visibleBriefings.length ? (viewMode === 'table' ? <ReviewTable briefings={visibleBriefings} users={users} memberScores={memberScores} onSelect={setSelected} /> : <div className="grid gap-4 xl:grid-cols-2">{visibleBriefings.map((item) => <ReviewCard key={item.ID} briefing={item} users={users} memberScores={memberScores} onClick={() => setSelected(item)} />)}</div>) : <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-center text-slate-400"><ClipboardCheck size={34} className="mb-3" /><h2 className="font-black text-slate-600">ไม่มีงานในคิวที่เลือก</h2><p className="mt-1 text-sm">เมื่องานถูกส่งตรวจ จะปรากฏในหน้านี้ทันที</p></div>}
      {selected && <ReviewDialog briefing={selected} users={users} onClose={() => setSelected(null)} onScoresSaved={(briefingId, rows) => setMemberScores((current) => [...current.filter((item) => String(item.BriefingID) !== String(briefingId)), ...rows])} onChanged={async () => { setSelected(null); await load(true); await loadSubmissions(); }} />}
    </div>
  );
};

const SettingInput = ({ label, value, onChange }) => <label><span className="mb-1 block text-xs font-bold text-slate-600">{label}</span><input min="0" type="number" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} className="review-field" /></label>;

const QueueStat = ({ label, value, color, icon, onClick, active }) => {
  const palette = {
    fuchsia: { active: 'border-fuchsia-300 bg-fuchsia-50 ring-2 ring-fuchsia-100', icon: 'bg-fuchsia-100 text-fuchsia-700' },
    orange: { active: 'border-orange-300 bg-orange-50 ring-2 ring-orange-100', icon: 'bg-orange-100 text-orange-700' },
    amber: { active: 'border-amber-300 bg-amber-50 ring-2 ring-amber-100', icon: 'bg-amber-100 text-amber-700' },
  };
  const style = palette[color] || palette.fuchsia;
  return <button onClick={onClick} className={`flex items-center justify-between rounded-2xl border p-4 text-left shadow-sm transition ${active ? style.active : 'border-slate-200 bg-white hover:bg-slate-50'}`}><span><span className="block text-xs font-bold text-slate-500">{label}</span><span className="mt-1 block text-3xl font-black text-slate-800">{value}</span></span><span className={`rounded-xl p-2 ${style.icon}`}>{icon}</span></button>;
};

const PriorityPill = ({ priority }) => {
  const meta = PRIORITY_META[priority] || PRIORITY_META.Medium;
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.className}`}>{meta.label}</span>;
};

const DueBadge = ({ briefing }) => {
  const overdue = isReviewOverdue(briefing);
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-bold ${overdue ? 'text-rose-600' : 'text-slate-500'}`}><CalendarDays size={13} />{briefing.DueDate || 'ไม่ระบุ'}{overdue && <span className="rounded bg-rose-50 px-1 py-0.5 text-[9px] font-black">เลยกำหนด</span>}</span>;
};

const ReviewTable = ({ briefings, users, memberScores = [], onSelect }) => <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[860px] text-left text-sm"><thead><tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500"><th className="px-4 py-3">#</th><th className="px-4 py-3">งาน</th><th className="px-4 py-3">ผู้มอบหมาย</th><th className="px-4 py-3">ผู้รับ</th><th className="px-4 py-3">ความสำคัญ</th><th className="px-4 py-3">กำหนดส่ง</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3">ส่งตรวจล่าสุด</th><th className="px-4 py-3 text-right">ให้คะแนน</th></tr></thead><tbody>{briefings.map((briefing, index) => { const creator = users.find((item) => String(item.ID) === String(briefing.CreatorID)); const assignees = (briefing.Assignees || []).map((id) => users.find((item) => String(item.ID) === String(id))).filter(Boolean); const progress = getScoreProgress(briefing, memberScores); return <tr key={briefing.ID} onClick={() => onSelect(briefing)} className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-blue-50/40"><td className="px-4 py-3 text-xs font-bold text-slate-400">{index + 1}</td><td className="max-w-64 px-4 py-3"><p className="text-[10px] font-black text-slate-400">{briefing.RunningID}</p><p className="truncate text-sm font-black text-slate-800">{briefing.Title || briefing.Detail}</p></td><td className="px-4 py-3"><div className="flex items-center gap-2"><Avatar person={creator} className="h-6 w-6" /><span className="max-w-28 truncate text-xs font-bold text-slate-700">{creator?.Name || creator?.Username || '-'}</span></div></td><td className="px-4 py-3"><div className="flex -space-x-2">{assignees.slice(0, 3).map((person) => <Avatar key={person.ID} person={person} className="h-6 w-6 border-2 border-white" />)}{assignees.length > 3 && <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[9px] font-black text-slate-600">+{assignees.length - 3}</span>}</div></td><td className="px-4 py-3"><PriorityPill priority={briefing.Priority} /></td><td className="px-4 py-3"><DueBadge briefing={briefing} /></td><td className="px-4 py-3"><Pill status={briefing.Status} /></td><td className="px-4 py-3"><SubmittedAt briefing={briefing} /></td><td className={`px-4 py-3 text-right text-sm font-black ${progress.done ? 'text-emerald-700' : 'text-amber-600'}`}>{progress.label}</td></tr>; })}</tbody></table></div>;

const ReviewCard = ({ briefing, users, memberScores = [], onClick }) => {
  const creator = users.find((item) => String(item.ID) === String(briefing.CreatorID));
  const assignees = (briefing.Assignees || []).map((id) => users.find((item) => String(item.ID) === String(id))).filter(Boolean);
  const progress = getScoreProgress(briefing, memberScores);
  return <button onClick={onClick} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{briefing.RunningID}</span><Pill status={briefing.Status} /><PriorityPill priority={briefing.Priority} /><DueBadge briefing={briefing} /></div><h2 className="line-clamp-2 text-base font-black text-slate-900 group-hover:text-blue-700">{briefing.Title || briefing.Detail}</h2><p className="mt-1 line-clamp-2 text-sm text-slate-500">{briefing.Detail}</p></div><ChevronRight className="mt-5 shrink-0 text-slate-300 group-hover:text-blue-500" /></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><Metric label="ส่งตรวจล่าสุด" value={briefing.ReviewSubmittedAt ? formatBangkokDateTime(briefing.ReviewSubmittedAt) : 'ยังไม่ส่ง'} /><Metric label="ให้คะแนนรายคน" value={progress.label} /><Metric label="สั่งแก้" value={`${briefing.CorrectionCount || 0} ครั้ง`} /><Metric label="ผิด/ร้ายแรง" value={`${(briefing.RejectedCount || 0) + (briefing.SevereErrorCount || 0)} ครั้ง`} /></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><div className="flex min-w-0 items-center gap-2"><Avatar person={creator} className="h-7 w-7" /><div className="min-w-0"><p className="truncate text-xs font-black text-slate-700">ผู้มอบหมาย: {creator?.Name || creator?.Username || '-'}</p><p className="text-[10px] text-slate-400">{creator?.Department || 'ไม่ระบุแผนก'}</p></div></div><div className="flex -space-x-2">{assignees.slice(0, 4).map((person) => <Avatar key={person.ID} person={person} className="h-7 w-7 border-2 border-white" />)}{assignees.length > 4 && <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[10px] font-black text-slate-600">+{assignees.length - 4}</span>}</div></div></button>;
};

// Draft per participant: the saved row, else the old shared score as a
// suggestion so an in-flight legacy brief only needs "บันทึกทั้งหมด".
const buildScoreDrafts = (briefing, rows, participants) => Object.fromEntries(participants.map(({ id }) => {
  const row = rows.find((item) => String(item.UserID) === id);
  if (row) return [id, { points: String(Number(row.Points)), bonusLevel: row.BonusLevel || 'standard' }];
  const legacy = Number(briefing?.Points) > 0 && id !== String(briefing?.CreatorID) ? String(Number(briefing.Points)) : '';
  return [id, { points: legacy, bonusLevel: briefing?.BonusLevel || 'standard' }];
}));

const isDraftDirty = (draft, row) => {
  if (!draft || draft.points === '') return false;
  if (!row) return true;
  return Number(row.Points) !== Number(draft.points) || (row.BonusLevel || 'standard') !== draft.bonusLevel;
};

const ReviewDialog = ({ briefing, users, onClose, onChanged, onScoresSaved }) => {
  const [detail, setDetail] = useState(null);
  const [responses, setResponses] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [commentImages, setCommentImages] = useState([]);
  const [uploadingComment, setUploadingComment] = useState(false);
  const [bonusLevel, setBonusLevel] = useState(briefing.BonusLevel || 'standard');
  const [targetPoints, setTargetPoints] = useState(getBriefingAwardedPoints(briefing));
  const [confirmSevere, setConfirmSevere] = useState(false);
  const [targetUserIds, setTargetUserIds] = useState([]);
  const [scoreRows, setScoreRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  // Prefilled with how many days the work is already overdue, so the head
  // only confirms the extension instead of counting days.
  const [extensionDays, setExtensionDays] = useState(() => Math.max(1, getOverdueDays(briefing?.DueDate)));
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [briefingData, responseData, historyData, scoreData] = await Promise.all([apiService.getBriefingById(briefing.ID), apiService.getBriefingResponses(briefing.ID), apiService.getBriefingReviewHistory(briefing.ID), apiService.getBriefingMemberScores(briefing.ID)]);
      setDetail(briefingData); setResponses(responseData || []); setHistory(historyData || []);
      setScoreRows(scoreData || []); setDrafts(buildScoreDrafts(briefingData, scoreData || [], getBriefingReviewParticipants(briefingData, users)));
      setBonusLevel(briefingData.BonusLevel || 'standard'); setTargetPoints(getBriefingAwardedPoints(briefingData));
      setExtensionDays(Math.max(1, getOverdueDays(briefingData.DueDate)));
    } catch (error) { toast.error(`ไม่สามารถโหลดงานตรวจ: ${error.message}`); }
    finally { setLoading(false); }
  }, [briefing.ID, users]);

  useEffect(() => { load(); }, [load]);
  const current = detail || briefing;
  const creator = users.find((item) => String(item.ID) === String(current.CreatorID));
  const assignees = (current.Assignees || []).map((id) => ({ id: String(id), person: users.find((item) => String(item.ID) === String(id)) }));
  const reviewParticipants = getBriefingReviewParticipants(current, users);
  const remaining = Math.max(0, Number(current.Points || 0) - Number(current.DeductedPoints || 0));
  const bonusPreview = getBonusLevelDetails(bonusLevel, remaining);
  const scorePreview = getScoreAdjustmentPreview(current, targetPoints);
  const isCompleted = current.Status === 'เสร็จสิ้น';
  // Closed under the old single shared score: keep the old score tools.
  const isLegacyClosed = isCompleted && scoreRows.length === 0;
  const scoredAssignees = assignees.filter(({ id }) => scoreRows.some((row) => String(row.UserID) === id)).length;
  const setDraft = (id, patch) => setDrafts((all) => ({ ...all, [id]: { ...all[id], ...patch } }));

  const persistScores = async (ids) => {
    const items = ids.map((id) => ({ userId: id, ...drafts[id] })).filter((item) => item.points !== '' && item.points !== undefined);
    if (!items.length) return scoreRows;
    const saved = await apiService.saveBriefingMemberScores(briefing.ID, items.map((item) => ({ userId: item.userId, points: item.points, bonusLevel: item.bonusLevel })));
    setScoreRows(saved); onScoresSaved?.(briefing.ID, saved);
    return saved;
  };
  const saveScores = async (ids) => {
    const dirty = ids.filter((id) => isDraftDirty(drafts[id], scoreRows.find((row) => String(row.UserID) === id)));
    if (!dirty.length) { toast('ไม่มีคะแนนที่เปลี่ยน'); return; }
    setSaving(true);
    try { await persistScores(dirty); toast.success(dirty.length > 1 ? `บันทึกคะแนน ${dirty.length} คนแล้ว` : 'บันทึกคะแนนแล้ว'); const historyData = await apiService.getBriefingReviewHistory(briefing.ID); setHistory(historyData || []); }
    catch (error) { toast.error(`บันทึกคะแนนไม่สำเร็จ: ${error.message}`); }
    finally { setSaving(false); }
  };
  const toggleTarget = (id) => setTargetUserIds((selected) => selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);

  // A severe error deducts the monthly score of everyone selected, so it is
  // the one action that asks the reviewer to confirm before it fires.
  const requestSevere = () => {
    if (!comment.trim()) { toast.error('กรุณาระบุหมายเหตุหรือเหตุผลก่อน คำสั่งนี้บังคับกรอก'); return; }
    if (targetUserIds.length === 0) { toast.error('กรุณาเลือกผู้เกี่ยวข้องที่ต้องหักคะแนน'); return; }
    setConfirmSevere(true);
  };

  // Screenshots of the mistake travel with the note itself, so the recipient
  // sees what to fix instead of guessing from a sentence.
  const addCommentImages = async (event) => {
    const files = snapshotSelectedFiles(event.currentTarget);
    const usable = getImageFiles(files);
    if (!usable.length) { toast.error('กรุณาเลือกไฟล์รูปภาพ เช่น JPG, PNG, WebP หรือ HEIC จาก iPhone'); return; }
    if (commentImages.length + usable.length > MAX_REVIEW_COMMENT_IMAGES) {
      toast.error(`แนบรูปในหมายเหตุได้สูงสุด ${MAX_REVIEW_COMMENT_IMAGES} รูป`); return;
    }
    setUploadingComment(true);
    try {
      const compressed = await Promise.all(usable.map((file) => compressImageDetails(file)));
      const uploaded = await Promise.all(compressed.map((result) => apiService.uploadImage(result.blob, { folder: 'briefings/review-note' })));
      setCommentImages((current) => [...current, ...uploaded.map((file) => file.url)]);
    } catch (error) { toast.error(error.message || 'อัปโหลดรูปภาพไม่สำเร็จ'); }
    finally { setUploadingComment(false); }
  };
  const removeCommentImage = (index) => setCommentImages((current) => current.filter((_, position) => position !== index));

  const action = async (type) => {
    if (requiresReviewComment(type) && !comment.trim()) { toast.error('กรุณาระบุหมายเหตุหรือเหตุผลก่อน คำสั่งนี้บังคับกรอก'); return; }
    if (['rejected', 'severe_error'].includes(type) && targetUserIds.length === 0) { toast.error('กรุณาเลือกผู้เกี่ยวข้องที่ต้องหักคะแนน'); return; }
    if (uploadingComment) { toast.error('รูปแนบยังอัปโหลดไม่เสร็จ กรุณารอสักครู่'); return; }
    if (type === 'approved') {
      const missing = assignees.filter(({ id }) => !drafts[id] || drafts[id].points === '');
      if (missing.length) { toast.error(`กรุณาให้คะแนนผู้รับงานให้ครบก่อนอนุมัติ (ยังขาด ${missing.map(({ id, person }) => person?.Name || person?.Username || id).join(', ')})`); return; }
    }
    setSaving(true);
    try {
      if (type === 'approved') {
        const dirty = reviewParticipants.map(({ id }) => id).filter((id) => isDraftDirty(drafts[id], scoreRows.find((row) => String(row.UserID) === id)));
        if (dirty.length) await persistScores(dirty);
      }
      await apiService.reviewBriefing({
        briefingId: briefing.ID, action: type, comment, commentImages,
        bonusLevel: null,
        targetUserIds: ['rejected', 'severe_error'].includes(type) ? targetUserIds : null,
        extraPoints: null,
        extensionDays: type === 'extend_deadline' ? Math.max(1, Number(extensionDays) || 1) : null,
      });
      setComment(''); setCommentImages([]);
      const messages = { approved: 'อนุมัติและปิดงานพร้อมคะแนนรายคนแล้ว', needs_revision: 'ส่งคำสั่งแก้ไขและหักคะแนน Task แล้ว', rejected: 'บันทึกความผิดพลาดในคะแนนรายเดือนแล้ว', severe_error: 'บันทึกความผิดพลาดร้ายแรงในคะแนนรายเดือนแล้ว', extra_work: 'สั่งเพิ่มงานแล้ว ปรับคะแนนรายคนได้ที่แผงคะแนน', extend_deadline: 'ขยายเวลาและปรับคืนคะแนนล่าช้าแล้ว' };
      toast.success(messages[type] || 'ดำเนินการเรียบร้อย'); await onChanged();
    } catch (error) { toast.error(`ดำเนินการไม่สำเร็จ: ${error.message}`); }
    finally { setSaving(false); }
  };

  const saveBonus = async () => { setSaving(true); try { await apiService.reviewBriefing({ briefingId: briefing.ID, action: 'bonus', comment: `ปรับระดับคะแนนพิเศษเป็น ${bonusPreview.label}`, bonusLevel }); toast.success(`บันทึกระดับ ${bonusPreview.label} แล้ว`); await load(); } catch (error) { toast.error(`บันทึกไม่สำเร็จ: ${error.message}`); } finally { setSaving(false); } };
  const saveScoreAdjustment = async () => { if (scorePreview.delta === 0) { toast('คะแนนรวมเท่าเดิม จึงไม่มีคะแนนเพิ่มหรือลด'); return; } setSaving(true); try { await apiService.reviewBriefing({ briefingId: briefing.ID, action: 'score_adjustment', comment: 'ปรับคะแนนหลังปิดงาน', targetPoints: scorePreview.targetPoints }); toast.success(`ปรับคะแนน ${scorePreview.delta > 0 ? '+' : ''}${scorePreview.delta} คะแนนแล้ว`); await load(); } catch (error) { toast.error(`ปรับคะแนนไม่สำเร็จ: ${error.message}`); } finally { setSaving(false); } };

  return <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6"><div className="flex h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-fuchsia-50 via-white to-emerald-50 px-4 py-4 sm:px-6"><div><div className="mb-1 flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-black text-white">{briefing.RunningID}</span><Pill status={current.Status} /></div><h2 className="text-lg font-black text-slate-900 sm:text-xl">ตรวจงาน: {current.Title || current.Detail}</h2></div><button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="ปิด"><X size={21} /></button></header>{loading ? <div className="flex flex-1 items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" />กำลังโหลด…</div> : <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,.95fr)]"><section className="min-w-0 space-y-5"><article className="rounded-2xl border border-slate-200 p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Avatar person={creator} /><div><p className="text-xs text-slate-400">ผู้มอบหมายงาน</p><p className="text-sm font-black text-slate-800">{creator?.Name || creator?.Username || '-'}</p></div></div><div className="text-right text-xs text-slate-500"><p>เริ่ม {current.StartDate || '-'}</p><p>สิ้นสุด {current.DueDate || '-'}</p>{current.TotalExtendedDays > 0 && <p className="font-bold text-sky-600">ขยายแล้ว {current.TotalExtendedDays} วัน</p>}</div></div><h3 className="text-base font-black text-slate-900">{current.Title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{current.Detail}</p>{current.CreatorNote && <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900"><b className="block text-xs">หมายเหตุผู้มอบหมาย</b><p className="mt-1 whitespace-pre-wrap">{current.CreatorNote}</p></div>}</article><article className="rounded-2xl border border-slate-200 p-4 sm:p-5"><h3 className="mb-3 font-black text-slate-800">ผู้รับงานและหลักฐาน</h3><div className="space-y-4">{assignees.map(({ id, person }) => { const response = responses.find((item) => String(item.UserID) === id); const images = getBriefingImages(response, 'ResultImages', 'ResultImage'); const lastSubmit = getLatestSubmission(history, id); return <div key={id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Avatar person={person} /><div className="min-w-0"><p className="truncate text-sm font-black text-slate-800">{person?.Name || person?.Username || id}</p><p className={`flex items-center gap-1 text-[11px] font-bold ${response?.SubmittedAt ? 'text-fuchsia-700' : 'text-slate-400'}`}><Send size={11} />{response?.SubmittedAt ? `ส่งตรวจ ${formatBangkokDateTime(response.SubmittedAt)}` : lastSubmit ? `ส่งรอบก่อน ${formatBangkokDateTime(lastSubmit.CreatedAt)}` : 'ยังไม่กดส่งตรวจ'}</p></div></div><Pill status={response?.Status || 'ยังไม่ส่ง'} /></div>{response?.Note && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-slate-700">{response.Note}</p>}{[response?.URL1, response?.URL2].filter(Boolean).map((url) => { const safeUrl = normalizeExternalLink(url); return safeUrl ? <a key={url} href={safeUrl} target="_blank" rel="noopener noreferrer" className="mt-2 flex min-w-0 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"><LinkIcon size={14} className="shrink-0" /><span className="truncate">{url}</span><ExternalLink size={13} className="ml-auto shrink-0" /></a> : <p key={url} className="mt-2 truncate rounded-xl bg-white px-3 py-2 text-xs text-slate-500" title={url}>ลิงก์ไม่ปลอดภัย: {url}</p>; })}{response && !response.Note && !response.URL1 && !response.URL2 && images.length === 0 && <p className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-400">ส่งงานแล้วแต่ยังไม่มีหลักฐานแนบ</p>}{images.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">{images.map((image, index) => <img key={`${image}-${index}`} onClick={() => setPreview(image)} src={image} alt="หลักฐานงาน" className="aspect-square w-full cursor-zoom-in rounded-lg border border-slate-200 object-cover" />)}</div>}</div>; })}</div></article></section><aside className="space-y-5">{isLegacyClosed ? <article className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"><h3 className="mb-3 flex items-center gap-2 font-black text-indigo-950"><Award size={18} /> คะแนนงานนี้</h3><div className="grid grid-cols-2 gap-2"><Metric label="ตั้งต้น" value={formatBriefingPoints(current.Points || 0)} /><Metric label="หักจาก Task" value={formatBriefingPoints(current.DeductedPoints || 0)} /><Metric label="คงเหลือ" value={formatBriefingPoints(remaining)} /><Metric label="โบนัส" value={`+${formatBriefingPoints(current.BonusPoints || 0)}`} /></div><div className="mt-3 grid grid-cols-3 gap-2 text-[11px]"><span className="rounded-lg bg-white px-2 py-1.5 text-slate-600">แก้ {current.CorrectionCount || 0}</span><span className="rounded-lg bg-white px-2 py-1.5 text-slate-600">ผิด {current.RejectedCount || 0}</span><span className="rounded-lg bg-white px-2 py-1.5 text-slate-600">ร้ายแรง {current.SevereErrorCount || 0}</span></div><div className="mt-4 border-t border-indigo-100 pt-3"><label className="mb-1 block text-xs font-bold text-indigo-900">ระดับคะแนนพิเศษ</label><div className="flex gap-2"><CustomSelect value={bonusLevel} onChange={setBonusLevel} options={BONUS_LEVEL_OPTIONS} className="min-w-0 flex-1" /><button disabled={saving} onClick={saveBonus} className="rounded-xl bg-indigo-600 px-3 text-xs font-black text-white disabled:opacity-50">บันทึก</button></div><div className="mt-2 rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs text-indigo-900"><p className="font-black">{bonusPreview.label}: {formatBriefingPoints(bonusPreview.basePoints)} → {formatBriefingPoints(bonusPreview.totalPoints)}</p><p className="mt-0.5 text-[11px] text-indigo-700">โบนัส +{formatBriefingPoints(bonusPreview.bonusPoints)} เมื่ออนุมัติ</p></div></div>{isCompleted && <div className="mt-4 rounded-xl border border-sky-200 bg-white p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-black text-sky-950">ปรับคะแนนหลังปิดงาน</p><p className="text-[11px] text-sky-800">คำนวณเฉพาะส่วนต่าง</p></div><span className="rounded-lg bg-sky-50 px-2 py-1 text-xs font-black text-sky-700">ปัจจุบัน {scorePreview.currentPoints}</span></div><div className="mt-2 flex gap-2"><input min="0" step="0.5" type="number" value={targetPoints} onChange={(event) => setTargetPoints(event.target.value)} className="review-field min-w-0 flex-1" aria-label="คะแนนรวมใหม่" /><button disabled={saving || scorePreview.delta === 0} onClick={saveScoreAdjustment} className="rounded-xl bg-sky-600 px-3 text-xs font-black text-white disabled:opacity-50">บันทึก {scorePreview.delta > 0 ? '+' : ''}{scorePreview.delta}</button></div></div>}</article> : <MemberScorePanel participants={reviewParticipants} assigneeIds={assignees.map(({ id }) => id)} drafts={drafts} setDraft={setDraft} scoreRows={scoreRows} briefing={current} saving={saving} onSave={saveScores} />}{!isCompleted && <ReviewActions participants={reviewParticipants} onSevere={requestSevere} overdueDays={getOverdueDays(current.DueDate)} targetUserIds={targetUserIds} toggleTarget={toggleTarget} comment={comment} setComment={setComment} commentImages={commentImages} addCommentImages={addCommentImages} removeCommentImage={removeCommentImage} uploadingComment={uploadingComment} onPreview={setPreview} saving={saving} extensionDays={extensionDays} setExtensionDays={setExtensionDays} action={action} bonusLabel={`ให้คะแนนแล้ว ${scoredAssignees}/${assignees.length} คน`} />}<HistoryList history={history} users={users} onPreview={setPreview} /></aside></div></main>}{confirmSevere && <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setConfirmSevere(false)}><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex items-center gap-2 text-red-800"><ShieldAlert size={22} /><h3 className="text-base font-black">ยืนยันความผิดพลาดร้ายแรง</h3></div><p className="text-sm leading-6 text-slate-600">คำสั่งนี้จะหักคะแนนรายเดือนของผู้ที่เลือกไว้ {targetUserIds.length} คน ตามเรทความผิดพลาดร้ายแรงของแผนก และบันทึกลงประวัติการตรวจทันที</p><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmSevere(false)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">ยกเลิก</button><button type="button" disabled={saving} onClick={() => { setConfirmSevere(false); action('severe_error'); }} className="rounded-xl bg-red-800 px-3 py-2.5 text-sm font-black text-white hover:bg-red-900 disabled:opacity-50">ยืนยันร้ายแรง</button></div></div></div>}{preview && <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/90 p-4" onClick={() => setPreview(null)}><img src={preview} alt="หลักฐานงาน" className="max-h-full max-w-full rounded-xl object-contain" /></div>}</div></div>;
};

const CommentImageStrip = ({ images = [], onAdd, onRemove, onPreview, uploading, disabled }) => <div className="mt-2">
  <div className="flex flex-wrap items-center justify-between gap-2">
    <span className="text-[11px] font-bold text-slate-600">รูปประกอบที่ผิด <small className="font-semibold text-slate-400">(ไม่บังคับ · สูงสุด {MAX_REVIEW_COMMENT_IMAGES} รูป)</small></span>
    {images.length < MAX_REVIEW_COMMENT_IMAGES && <label className={`inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1.5 text-[11px] font-bold text-fuchsia-700 transition hover:bg-fuchsia-100 ${uploading || disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
      {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}{uploading ? 'กำลังอัปโหลด…' : `แนบรูป (${images.length}/${MAX_REVIEW_COMMENT_IMAGES})`}
      <input className="hidden" type="file" accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp" multiple disabled={uploading || disabled} onChange={onAdd} />
    </label>}
  </div>
  {images.length > 0 && <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">{images.map((image, index) => <div key={`${image}-${index}`} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
    <img src={image} alt={`รูปประกอบที่ ${index + 1}`} onClick={() => onPreview?.(image)} className="h-full w-full cursor-zoom-in object-cover" />
    <button type="button" aria-label="ลบรูป" onClick={() => onRemove(index)} className="absolute right-0.5 top-0.5 rounded-md bg-rose-600 p-0.5 text-white opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100"><X size={11} /></button>
  </div>)}</div>}
</div>;

const ReviewActions = ({ participants, targetUserIds, toggleTarget, comment, setComment, commentImages = [], addCommentImages, removeCommentImage, uploadingComment = false, onPreview, saving, extensionDays, setExtensionDays, action, onSevere, overdueDays = 0, bonusLabel }) => <article className="rounded-2xl border border-slate-200 p-4"><h3 className="font-black text-slate-800">ผู้เกี่ยวข้องที่ถูกหักรายเดือน</h3><p className="mt-1 text-[11px] text-slate-500">เลือกได้ทั้งผู้บรีฟงานและผู้รับงาน ใช้กับความผิดพลาดและร้ายแรง</p><div className="mt-3 flex flex-wrap gap-2">{participants.map(({ id, person, roleLabel }) => <button key={id} type="button" onClick={() => toggleTarget(id)} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-bold ${targetUserIds.includes(id) ? 'border-rose-300 bg-rose-50 text-rose-700 ring-2 ring-rose-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><Avatar person={person} className="h-6 w-6" /><span>{person?.Name || person?.Username || id}<small className="block text-[9px] font-semibold opacity-70">{roleLabel}</small></span></button>)}</div><label className="mt-4 block"><span className="mb-1 block text-xs font-black text-slate-700">หมายเหตุถึงผู้รับงาน <span className="text-rose-600">*</span><small className="ml-1 font-semibold text-slate-500">บังคับกรอกทุกครั้งที่สั่งแก้ไข ความผิดพลาด สั่งงานเพิ่ม หรือขยายเวลา</small></span><textarea value={comment} onChange={(event) => setComment(event.target.value)} className="review-field min-h-24 resize-y" placeholder="ระบุให้ชัดว่าสั่งอะไรเพิ่ม ต้องแก้ตรงไหน หรือขยายเวลาเพราะอะไร ข้อความนี้จะแสดงในหน้าบรีฟของผู้รับงาน" /></label><CommentImageStrip images={commentImages} onAdd={addCommentImages} onRemove={removeCommentImage} onPreview={onPreview} uploading={uploadingComment} disabled={saving} /><div className="mt-4 grid auto-rows-fr gap-2 sm:grid-cols-2"><ActionButton color="orange" icon={<MessageSquareWarning size={16} />} label="สั่งแก้ไข" detail="หักคะแนน Task" disabled={saving} onClick={() => action('needs_revision')} /><ActionButton color="rose" icon={<AlertTriangle size={16} />} label="ความผิดพลาด" detail="หักรายเดือน" disabled={saving} onClick={() => action('rejected')} /><ActionButton color="red" icon={<ShieldAlert size={16} />} label="ร้ายแรง" detail="หักรายเดือน" disabled={saving} onClick={() => (onSevere || (() => action('severe_error')))()} /><button disabled={saving} onClick={() => action('extra_work')} className="flex h-full min-h-[64px] w-full flex-col items-start justify-center gap-1 rounded-xl bg-sky-600 px-3 py-2.5 text-left text-white hover:bg-sky-700 disabled:opacity-50"><span className="inline-flex items-center gap-1.5 text-xs font-black"><ListPlus size={16} />สั่งเพิ่มงาน</span><span className="text-[10px] font-semibold opacity-80">ปรับคะแนนรายคนเองได้ที่แผงคะแนน</span></button><div className="flex min-h-[64px] flex-col justify-center rounded-xl border border-violet-200 bg-violet-50 p-2"><label className="text-[10px] font-bold text-violet-800">ขยายเวลาทั้งงาน (วัน){overdueDays > 0 && <span className="ml-1 rounded bg-rose-100 px-1 py-0.5 text-[9px] font-black text-rose-700">เลยกำหนด {overdueDays} วัน</span>}</label><div className="mt-1 flex gap-2"><input min="1" type="number" value={extensionDays} onChange={(event) => setExtensionDays(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-violet-200 px-2 py-1.5 text-xs" /><button disabled={saving} onClick={() => action('extend_deadline')} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 text-xs font-black text-white disabled:opacity-50"><CalendarPlus size={14} />ขยาย</button></div></div><ActionButton color="emerald" icon={<CheckCircle2 size={16} />} label="อนุมัติผ่าน" detail={bonusLabel} disabled={saving} onClick={() => action('approved')} /></div></article>;

const ActionButton = ({ color, icon, label, detail, disabled, onClick }) => {
  const styles = { orange: 'bg-orange-500 hover:bg-orange-600', rose: 'bg-rose-600 hover:bg-rose-700', red: 'bg-red-800 hover:bg-red-900', emerald: 'bg-emerald-600 hover:bg-emerald-700' };
  return <button disabled={disabled} onClick={onClick} className={`flex h-full min-h-[64px] w-full flex-col items-start justify-center gap-1 rounded-xl px-3 py-2.5 text-left text-white disabled:opacity-50 ${styles[color]}`}><span className="inline-flex items-center gap-1.5 text-xs font-black">{icon}{label}</span><span className="text-[10px] font-semibold opacity-80">{detail}</span></button>;
};

const historyLabel = (action) => ({ SUBMITTED: 'ส่งเข้าตรวจ', NEEDS_REVISION: 'สั่งแก้ไข', REJECTED: 'ความผิดพลาด', SEVERE_ERROR: 'ความผิดพลาดร้ายแรง', APPROVED: 'อนุมัติผ่าน', BONUS_UPDATED: 'ปรับคะแนนพิเศษ', SCORE_ADJUSTED: 'ปรับคะแนนหลังปิดงาน', DEADLINE_EXTENDED: 'ขยายเวลา', EXTRA_WORK: 'สั่งเพิ่มงาน', MEMBER_SCORED: 'ให้คะแนนรายคน' }[action] || action);

const personName = (users, id) => { const person = (users || []).find((item) => String(item.ID) === String(id)); return person?.Name || person?.Username || id; };
const historyTargets = (event) => { const value = event?.TargetUserIDs; if (Array.isArray(value)) return value; try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; } };

const HistoryList = ({ history, users = [], onPreview }) => <article className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-3 font-black text-slate-800">ประวัติการตรวจ</h3>{history.length ? <ol className="space-y-3">{history.map((event) => <li key={event.ID} className="border-l-2 border-slate-200 pl-3"><p className="text-xs font-black text-slate-700">{historyLabel(event.Action)} {event.PointsDeducted > 0 && <span className="text-rose-600">−{event.PointsDeducted}</span>}{event.Action === 'BONUS_UPDATED' && <span className="text-indigo-600"> {event.BonusLevel ? getBonusLevelDetails(event.BonusLevel, 0).label : 'คะแนนพิเศษเดิม'} · +{formatBriefingPoints(event.BonusPoints)}</span>}{event.Action === 'SCORE_ADJUSTED' && <span className="text-sky-600"> {event.PointsDelta > 0 ? '+' : ''}{event.PointsDelta}</span>}{event.Action === 'EXTRA_WORK' && Number(event.ExtraPoints) > 0 && <span className="text-sky-600"> +{event.ExtraPoints} คะแนน</span>}{['SUBMITTED', 'MEMBER_SCORED'].includes(event.Action) && historyTargets(event).length > 0 && <span className="text-slate-500"> · {historyTargets(event).map((id) => personName(users, id)).join(', ')}</span>}{event.Action === 'MEMBER_SCORED' && <span className="text-indigo-600"> {event.PreviousAwardedPoints === null || event.PreviousAwardedPoints === undefined ? '' : `${formatBriefingPoints(event.PreviousAwardedPoints)} → `}{formatBriefingPoints(event.NewAwardedPoints)} คะแนน</span>}{event.Action === 'DEADLINE_EXTENDED' && <span className="text-violet-600"> +{event.ExtensionDays} วัน ({event.NewDueDate})</span>}</p>{event.Comment && <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-500">{event.Comment}</p>}{(() => { const images = parseStoredImageArray(event.CommentImages); return images.length > 0 && <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-6">{images.map((image, index) => <img key={`${image}-${index}`} src={image} alt={`รูปประกอบที่ ${index + 1}`} onClick={() => onPreview?.(image)} className="aspect-square w-full cursor-zoom-in rounded-md border border-slate-200 object-cover" />)}</div>; })()}<p className="mt-1 text-[10px] text-slate-400">{new Date(event.CreatedAt).toLocaleString('th-TH')}</p></li>)}</ol> : <p className="text-sm text-slate-400">ยังไม่มีประวัติ</p>}</article>;

const POINT_ZERO_OPTION = { value: '0', label: '0 คะแนน' };

// The reviewer scores every participant separately. Assignees are required
// before approval; the person who briefed the work is optional. Each row has
// its own save, and "บันทึกทั้งหมด" saves every changed row at once.
const MemberScorePanel = ({ participants, assigneeIds, drafts, setDraft, scoreRows, briefing, saving, onSave }) => {
  const deducted = Number(briefing?.DeductedPoints || 0);
  const dirtyIds = participants.map(({ id }) => id).filter((id) => isDraftDirty(drafts[id], scoreRows.find((row) => String(row.UserID) === id)));
  return <article className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><h3 className="flex items-center gap-2 font-black text-indigo-950"><Award size={18} /> ให้คะแนนรายคน</h3><p className="mt-0.5 text-[11px] text-indigo-800">ผู้ตรวจเป็นผู้ให้คะแนนเท่านั้น · ผู้รับงานต้องครบก่อนอนุมัติ</p></div>{deducted > 0 && <span className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-700">สั่งแก้แล้ว หักคนละ {formatBriefingPoints(deducted)}</span>}</div>
    <div className="space-y-2">{participants.map(({ id, person, roleLabel }) => {
      const draft = drafts[id] || { points: '', bonusLevel: 'standard' };
      const row = scoreRows.find((item) => String(item.UserID) === id);
      const required = assigneeIds.includes(id);
      const dirty = isDraftDirty(draft, row);
      const preview = draft.points === '' ? null : getMemberAwardDetails({ Points: draft.points, BonusLevel: draft.bonusLevel }, deducted);
      return <div key={id} className={`rounded-xl border bg-white p-2.5 ${dirty ? 'border-amber-300' : 'border-indigo-100'}`}>
        <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><Avatar person={person} className="h-7 w-7" /><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{person?.Name || person?.Username || id}</p><p className="text-[10px] font-semibold text-slate-400">{required ? roleLabel === 'ผู้บรีฟงาน' ? 'บรีฟงานให้ตัวเอง · บังคับ' : 'ผู้รับงาน · บังคับ' : 'ผู้บรีฟงาน · ไม่บังคับ'}</p></div></div><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${row && !dirty ? 'bg-emerald-50 text-emerald-700' : dirty ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{row && !dirty ? 'บันทึกแล้ว' : dirty ? 'ยังไม่บันทึก' : 'ยังไม่ให้คะแนน'}</span></div>
        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2"><CustomSelect value={draft.points} placeholder="คะแนน" onChange={(value) => setDraft(id, { points: value })} options={[...getBriefingPointOptions(draft.points), POINT_ZERO_OPTION]} className="min-w-0" /><CustomSelect value={draft.bonusLevel} onChange={(value) => setDraft(id, { bonusLevel: value })} options={BONUS_LEVEL_OPTIONS} className="min-w-0" /><button type="button" disabled={saving || !dirty} onClick={() => onSave([id])} className="rounded-xl bg-indigo-600 px-3 text-xs font-black text-white disabled:opacity-40">บันทึก</button></div>
        {preview && <p className="mt-1.5 text-[11px] font-bold text-indigo-900">ได้ {formatBriefingPoints(preview.totalPoints)} คะแนน<span className="font-semibold text-indigo-600"> = {formatBriefingPoints(preview.basePoints)}{deducted > 0 ? ` − ${formatBriefingPoints(Math.min(deducted, preview.basePoints))}` : ''}{preview.bonusPoints > 0 ? ` + โบนัส ${formatBriefingPoints(preview.bonusPoints)}` : ''}</span></p>}
      </div>;
    })}</div>
    <button type="button" disabled={saving || dirtyIds.length === 0} onClick={() => onSave(dirtyIds)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-3 py-2.5 text-sm font-black text-white hover:bg-indigo-800 disabled:opacity-40"><Save size={15} />บันทึกทั้งหมด{dirtyIds.length > 0 ? ` (${dirtyIds.length})` : ''}</button>
    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]"><span className="rounded-lg bg-white px-2 py-1.5 text-slate-600">แก้ {briefing?.CorrectionCount || 0}</span><span className="rounded-lg bg-white px-2 py-1.5 text-slate-600">ผิด {briefing?.RejectedCount || 0}</span><span className="rounded-lg bg-white px-2 py-1.5 text-slate-600">ร้ายแรง {briefing?.SevereErrorCount || 0}</span></div>
  </article>;
};

// Who briefed, who received and who sent work to review on one day, with the
// time of every ส่งตรวจ. Follows the department and person filters above.
const DailySummary = ({ rows, users, today, date, onDateChange, onSelect }) => {
  const totals = rows.reduce((sum, row) => ({ created: sum.created + row.created.length, received: sum.received + row.received.length, submitted: sum.submitted + row.submissions.length }), { created: 0, received: 0, submitted: 0 });
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Users size={18} className="text-slate-500" /><div><h2 className="font-black text-slate-800">สรุปงานรายวันรายคน</h2><p className="text-xs text-slate-500">บรีฟที่สร้าง งานที่รับ และเวลาที่กดส่งตรวจ ตามแผนกและรายชื่อที่เลือกด้านบน</p></div></div><div className="flex items-center gap-2"><input type="date" value={date} max={today} onChange={(event) => onDateChange(event.target.value || today)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs" />{date !== today && <button type="button" onClick={() => onDateChange(today)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">วันนี้</button>}</div></div>
    <div className="mb-3 grid grid-cols-3 gap-2"><Metric label="บรีฟที่สร้าง" value={`${totals.created} งาน`} /><Metric label="งานที่รับ" value={`${totals.received} งาน`} /><Metric label="ส่งตรวจ" value={`${totals.submitted} ครั้ง`} /></div>
    {rows.length ? <div className="overflow-x-auto rounded-xl border border-slate-100"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="bg-slate-50 text-[11px] font-black text-slate-500"><th className="px-3 py-2.5">คน</th><th className="px-3 py-2.5 text-center">บรีฟที่สร้าง</th><th className="px-3 py-2.5 text-center">รับงาน</th><th className="px-3 py-2.5 text-center">ส่งตรวจ</th><th className="px-3 py-2.5">เวลาที่กดส่งตรวจ</th><th className="px-3 py-2.5 text-center">งานค้างในมือ</th></tr></thead><tbody>{rows.map((row) => { const person = users.find((item) => String(item.ID) === row.userId); return <tr key={row.userId} className="border-t border-slate-50 align-top"><td className="px-3 py-2.5"><div className="flex items-center gap-2"><Avatar person={person} className="h-7 w-7" /><div className="min-w-0"><p className="max-w-36 truncate text-xs font-black text-slate-800">{person?.Name || person?.Username || row.userId}</p><p className="text-[10px] text-slate-400">{person?.Department || ''}</p></div></div></td><td className="px-3 py-2.5 text-center font-black text-slate-700">{row.created.length}</td><td className="px-3 py-2.5 text-center font-black text-slate-700">{row.received.length}</td><td className="px-3 py-2.5 text-center font-black text-fuchsia-700">{row.submissions.length}</td><td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{row.submissions.length ? row.submissions.map(({ briefing, at }, index) => <button key={`${briefing.ID}-${at}-${index}`} type="button" onClick={() => onSelect(briefing)} title={briefing.Title || briefing.Detail} className="rounded-lg border border-fuchsia-100 bg-fuchsia-50 px-2 py-1 text-[10px] font-bold text-fuchsia-700 hover:bg-fuchsia-100">{formatBangkokTime(at)} · {briefing.RunningID}</button>) : <span className="text-[11px] text-slate-400">-</span>}</div></td><td className="px-3 py-2.5 text-center font-bold text-slate-500">{row.openInHand}</td></tr>; })}</tbody></table></div> : <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">ไม่มีการบรีฟ รับงาน หรือส่งตรวจในวันที่เลือก</p>}
  </section>;
};
