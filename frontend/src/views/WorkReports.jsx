import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CalendarDays, CalendarRange, Copy, FilterX, FolderOpen, Layers, Paperclip, Plus, RefreshCw, Search, User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { apiService, supabase } from '../services/api';
import { LoadingModal } from '../components/LoadingModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { CustomSelect } from '../components/CustomSelect';
import { CustomDatePicker } from '../components/CustomDatePicker';
import { FileTypeIcon, WorkReportDetailModal, WorkReportFormModal } from '../components/WorkReportModal';
import { PERIOD_BADGE_STYLES, copyReportLink, formatReportDate, formatReportPeriod } from '../utils/workReportDisplay';
import {
  REPORT_PERIOD_TYPES, canAccessReportsPage, canEditReport, canSubmitReport, canViewReport,
  classifyReportFile, filterReports, getReportPeriodLabel, parseReportAttachments, summarizeReports,
} from '../utils/workReports';

const PAGE_SIZE = 12;

const StatCard = ({ label, value, color, icon, onClick, active }) => (
  <button
    type="button"
    onClick={onClick}
    className={`p-4 rounded-2xl flex flex-col gap-2 transition-all hover:scale-105 active:scale-95 text-left border ${active ? 'bg-white shadow-md border-slate-200 ring-2 ring-offset-2 ring-blue-500/20' : 'bg-white/40 border-transparent hover:bg-white hover:border-slate-200'}`}
  >
    <div className={`w-8 h-8 rounded-lg ${color} text-white flex items-center justify-center shadow-sm`}>{icon}</div>
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  </button>
);

const ReportCard = ({ report, creator, onOpen, onCopy }) => {
  const attachments = parseReportAttachments(report.Attachments);
  const images = attachments.filter((item) => item.kind === 'image');
  const files = attachments.filter((item) => item.kind !== 'image');
  const period = formatReportPeriod(report);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === 'Enter') onOpen(); }}
      className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${PERIOD_BADGE_STYLES[report.PeriodType] || PERIOD_BADGE_STYLES.other}`}>{getReportPeriodLabel(report.PeriodType)}</span>
          {period && <span className="text-[11px] font-semibold text-slate-500">{period}</span>}
        </div>
        <button
          type="button"
          title="คัดลอกลิงก์"
          onClick={(event) => { event.stopPropagation(); onCopy(); }}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-blue-600"
        >
          <Copy size={15} />
        </button>
      </div>

      <div className="min-w-0">
        <h3 className="line-clamp-2 break-words font-bold text-slate-900">{report.Title}</h3>
        {report.Detail && <p className="mt-1 line-clamp-3 whitespace-pre-line break-words text-sm text-slate-500">{report.Detail}</p>}
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {images.slice(0, 4).map((image, index) => (
            <div key={image.url} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
              <img src={image.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              {index === 3 && images.length > 4 && (
                <span className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-sm font-bold text-white">+{images.length - 4}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.slice(0, 3).map((file) => (
            <span key={file.url} className="inline-flex max-w-[48%] items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
              <FileTypeIcon category={classifyReportFile({ name: file.name, type: file.mimeType })?.category} size={13} />
              <span className="truncate">{file.name}</span>
            </span>
          ))}
          {files.length > 3 && <span className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">+{files.length - 3} ไฟล์</span>}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-3 text-xs">
        {creator?.ProfileImage && creator.ProfileImage !== 'has_image' ? (
          <img src={creator.ProfileImage} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">{(creator?.Name || '?').charAt(0).toUpperCase()}</span>
        )}
        <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{creator?.Name || 'ไม่ทราบผู้ส่ง'}</span>
        {attachments.length > 0 && <span className="inline-flex items-center gap-0.5 text-slate-400"><Paperclip size={12} />{attachments.length}</span>}
        <span className="text-slate-400">{formatReportDate(report.CreatedAt, 'd MMM HH:mm')}</span>
      </div>
    </div>
  );
};

export const WorkReports = () => {
  const { user } = useAuth();
  const { reportId } = useParams();
  const navigate = useNavigate();
  const isAdmin = user?.Role === 'Admin';
  const hasPageAccess = canAccessReportsPage(user);
  const canCreate = canSubmitReport(user);

  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sharedReport, setSharedReport] = useState(null);
  const [formReport, setFormReport] = useState(undefined); // undefined = closed, null = new
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [periodType, setPeriodType] = useState('All');
  const [department, setDepartment] = useState('All');
  const [personId, setPersonId] = useState('All');
  const [mineOnly, setMineOnly] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!hasPageAccess) return;
    if (!quiet) setLoading(true);
    try {
      const [rows, people] = await Promise.all([apiService.getWorkReports(), apiService.getUsers()]);
      setReports(rows);
      setUsers(people || []);
    } catch (error) {
      console.warn('[WorkReports] load failed', error);
      toast.error(/WorkReports|schema cache|PGRST205|42P01/i.test(error.message || '')
        ? 'ฐานข้อมูลยังไม่ได้ติดตั้งระบบส่งสรุปงาน'
        : 'โหลดสรุปงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [hasPageAccess]);

  useEffect(() => { load(); }, [load]);

  // A shared link opens that one report for any signed-in account, even one
  // outside the author's department or without access to the full page.
  useEffect(() => {
    if (!reportId) { setSharedReport(null); return undefined; }
    let active = true;
    Promise.all([apiService.getWorkReportById(reportId), hasPageAccess ? Promise.resolve(null) : apiService.getUsers()])
      .then(([found, people]) => {
        if (!active) return;
        if (people) setUsers(people);
        if (!found) toast.error('ไม่พบสรุปงานนี้ อาจถูกลบไปแล้ว');
        setSharedReport(found || null);
        if (!hasPageAccess) setLoading(false);
      })
      .catch(() => { if (active) { toast.error('เปิดสรุปงานไม่สำเร็จ'); setLoading(false); } });
    return () => { active = false; };
  }, [reportId, hasPageAccess]);

  // Another person's new or edited report shows up without a refresh.
  useEffect(() => {
    if (!hasPageAccess || !supabase?.channel) return undefined;
    let timer;
    const channel = supabase
      .channel(`work-reports:${user?.ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'WorkReports' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => load(true), 400);
      })
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
  }, [hasPageAccess, load, user?.ID]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchTerm), 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, periodType, department, personId, mineOnly, startDate, endDate]);

  const usersById = useMemo(() => new Map(users.map((item) => [String(item.ID), item])), [users]);

  const visibleReports = useMemo(() => reports
    .filter((report) => canViewReport(report, user))
    .map((report) => ({ ...report, CreatorName: usersById.get(String(report.CreatorID))?.Name || '' })),
  [reports, user, usersById]);

  // Cards count everything except the type / "mine" choice they themselves set.
  const scopedReports = useMemo(() => filterReports(visibleReports, {
    search: searchQuery, department, userId: personId, startDate, endDate,
  }), [visibleReports, searchQuery, department, personId, startDate, endDate]);
  const stats = useMemo(() => summarizeReports(scopedReports, user), [scopedReports, user]);
  const filteredReports = useMemo(() => filterReports(scopedReports, { periodType, mine: mineOnly, viewer: user }),
    [scopedReports, periodType, mineOnly, user]);

  const departmentOptions = useMemo(() => {
    const names = [...new Set(visibleReports.map((report) => report.Department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
    return [{ label: 'ทุกแผนก', value: 'All' }, ...names.map((name) => ({ label: name, value: name }))];
  }, [visibleReports]);

  const personOptions = useMemo(() => {
    const ids = new Set(visibleReports.map((report) => String(report.CreatorID)));
    const people = users.filter((item) => ids.has(String(item.ID)))
      .sort((a, b) => String(a.Name || '').localeCompare(String(b.Name || ''), 'th'));
    return [{ label: 'ทุกคน', value: 'All' }, ...people.map((item) => ({ label: item.Name || item.Username, value: String(item.ID) }))];
  }, [visibleReports, users]);

  const clearFilters = () => {
    setSearchTerm(''); setSearchQuery(''); setPeriodType('All'); setDepartment('All');
    setPersonId('All'); setMineOnly(false); setStartDate(''); setEndDate('');
  };

  const openReport = (report) => navigate(`/reports/${report.ID}`);
  const closeReport = () => navigate('/reports');

  const handleCopy = async (report) => {
    try {
      if (await copyReportLink(report) === 'copied') {
        toast.success('คัดลอกลิงก์แล้ว ส่งต่อทาง LINE ได้เลย (ผู้รับต้องเข้าสู่ระบบก่อน)');
      }
    } catch {
      toast.error('คัดลอกไม่สำเร็จ');
    }
  };

  const handleSaved = (saved) => {
    setFormReport(undefined);
    if (saved?.ID) {
      const normalized = { ...saved, Attachments: parseReportAttachments(saved.Attachments) };
      setReports((current) => [normalized, ...current.filter((item) => item.ID !== saved.ID)]);
      setSharedReport((current) => (current?.ID === saved.ID ? normalized : current));
    }
    load(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiService.deleteWorkReport(deleteTarget.ID);
      setReports((current) => current.filter((item) => item.ID !== deleteTarget.ID));
      toast.success('ลบสรุปงานแล้ว');
      setDeleteTarget(null);
      if (reportId) closeReport();
    } catch (error) {
      toast.error(error.message || 'ลบไม่สำเร็จ');
    } finally {
      setDeleting(false);
    }
  };

  // The detail sheet steps aside while confirming a delete; otherwise it covered
  // the confirmation and people had to close it before they could confirm.
  const detailModal = sharedReport && formReport === undefined && !deleteTarget && (
    <WorkReportDetailModal
      report={sharedReport}
      creator={usersById.get(String(sharedReport.CreatorID))}
      canEdit={canEditReport(sharedReport, user)}
      onClose={hasPageAccess ? closeReport : () => navigate('/')}
      onEdit={() => setFormReport(sharedReport)}
      onDelete={() => setDeleteTarget(sharedReport)}
    />
  );

  const sharedModals = (
    <>
      {detailModal}
      {formReport !== undefined && <WorkReportFormModal report={formReport} onClose={() => setFormReport(undefined)} onSaved={handleSaved} />}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        isLoading={deleting}
        title="ลบสรุปงานนี้?"
        message={`"${deleteTarget?.Title || ''}" และไฟล์แนบทั้งหมดจะไม่แสดงในระบบอีก`}
      />
    </>
  );

  if (!hasPageAccess) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <LoadingModal isOpen={Boolean(reportId) && loading} operation="loading" message="สรุปงาน" />
        <FolderOpen size={40} className="mx-auto mb-3 text-slate-300" />
        <p className="font-bold text-slate-700">{reportId ? 'สรุปงานที่ส่งมาให้ดู' : 'คุณยังไม่มีสิทธิ์เข้าหน้าส่งสรุปงาน'}</p>
        <p className="text-sm text-slate-500">{reportId ? 'ปิดหน้าต่างเพื่อกลับหน้าหลัก' : 'ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์'}</p>
        {sharedModals}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <LoadingModal isOpen={loading} operation="loading" message="สรุปงาน" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <FolderOpen className="text-blue-600" size={26} />
            ส่งสรุปงาน
          </h2>
          <p className="text-slate-500">สรุปงานประจำสัปดาห์ / ประจำเดือน พร้อมแนบรูปและเอกสารหลักฐาน</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { load(true); toast.success('อัปเดตข้อมูลล่าสุดแล้ว', { position: 'bottom-right' }); }} title="ดึงข้อมูลล่าสุด" className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-400 shadow-sm transition hover:bg-blue-50 hover:text-blue-600">
            <RefreshCw size={20} />
          </button>
          <button type="button" onClick={clearFilters} className="flex items-center gap-2 rounded-xl border border-red-100 bg-white px-4 py-2.5 font-medium text-red-600 transition-all hover:bg-red-50 active:scale-95">
            <FilterX size={20} />
            ล้างการค้นหา
          </button>
          {canCreate && (
            <button type="button" onClick={() => setFormReport(null)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-95">
              <Plus size={20} />
              ส่งสรุปงานใหม่
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="ทั้งหมด" value={stats.total} color="bg-slate-800" icon={<Layers size={16} />} onClick={() => { setPeriodType('All'); setMineOnly(false); }} active={periodType === 'All' && !mineOnly} />
        <StatCard label="ประจำสัปดาห์" value={stats.weekly} color="bg-sky-600" icon={<CalendarDays size={16} />} onClick={() => { setPeriodType('weekly'); setMineOnly(false); }} active={periodType === 'weekly' && !mineOnly} />
        <StatCard label="ประจำเดือน" value={stats.monthly} color="bg-violet-600" icon={<CalendarRange size={16} />} onClick={() => { setPeriodType('monthly'); setMineOnly(false); }} active={periodType === 'monthly' && !mineOnly} />
        <StatCard label="อื่นๆ" value={stats.other} color="bg-slate-500" icon={<Paperclip size={16} />} onClick={() => { setPeriodType('other'); setMineOnly(false); }} active={periodType === 'other' && !mineOnly} />
        <StatCard label="ของฉัน" value={stats.mine} color="bg-emerald-600" icon={<User size={16} />} onClick={() => { setPeriodType('All'); setMineOnly(true); }} active={mineOnly} />
      </div>

      <div className="ios-filter-glass relative z-40 space-y-4 rounded-2xl px-6 py-3.5 shadow-md">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="group relative w-full flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500" size={18} />
            <input
              type="text"
              placeholder="ค้นหาหัวข้อ รายละเอียด ชื่อไฟล์ หรือผู้ส่ง..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-11 pr-4 text-sm font-semibold text-slate-900 transition-all focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="w-full lg:w-40">
            <CustomSelect value={periodType} borderDashed onChange={(value) => { setPeriodType(value); setMineOnly(false); }} options={[{ label: 'ทุกประเภท', value: 'All' }, ...REPORT_PERIOD_TYPES]} />
          </div>
          {(isAdmin || departmentOptions.length > 2) && (
            <div className="w-full lg:w-36">
              <CustomSelect value={department} borderDashed onChange={setDepartment} options={departmentOptions} />
            </div>
          )}
          <div className="w-full lg:w-44">
            <CustomSelect value={personId} borderDashed onChange={setPersonId} options={personOptions} searchable />
          </div>
          <div className="flex w-full gap-2 text-black lg:w-[370px]">
            <CustomDatePicker value={startDate} onChange={setStartDate} placeholder="ตั้งแต่" borderDashed />
            <CustomDatePicker value={endDate} onChange={setEndDate} placeholder="ถึง" borderDashed />
          </div>
        </div>
      </div>

      {filteredReports.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-slate-400">
          <FolderOpen size={36} className="mx-auto mb-2 text-slate-300" />
          {visibleReports.length === 0 ? 'ยังไม่มีสรุปงาน' : 'ไม่พบสรุปงานตามตัวกรอง'}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredReports.slice(0, visibleCount).map((report) => (
              <ReportCard
                key={report.ID}
                report={report}
                creator={usersById.get(String(report.CreatorID))}
                onOpen={() => openReport(report)}
                onCopy={() => handleCopy(report)}
              />
            ))}
          </div>
          <div className="flex flex-col items-center gap-2 pb-4">
            <p className="text-xs font-semibold text-slate-400">แสดง {Math.min(visibleCount, filteredReports.length)} จาก {filteredReports.length} รายการ</p>
            {visibleCount < filteredReports.length && (
              <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">แสดงเพิ่ม</button>
            )}
          </div>
        </>
      )}

      {sharedModals}
    </div>
  );
};
