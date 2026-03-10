import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Calendar, LayoutList, PieChart, X, ChevronLeft, ChevronRight, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { LoadingModal } from '../components/LoadingModal';
import { DailySummaryModal } from '../components/DailySummaryModal';
import { MonthlySummaryModal } from '../components/MonthlySummaryModal';
import { CustomSelect } from '../components/CustomSelect';
import { CustomDatePicker } from '../components/CustomDatePicker';
import { TaskModal } from '../components/TaskModal';

const ITEMS_PER_PAGE = 10;

// ─── Pagination Bar ───────────────────────────────────────────────────────────
const Pagination = ({ currentPage, totalPages, totalCount, pageSize, onPageChange, onPrefetchPage }) => {
  if (totalPages <= 1) return null;

  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  // Build page number array with ellipsis
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
      <p className="text-sm text-slate-500">
        แสดง <span className="font-semibold text-slate-700">{startItem}–{endItem}</span>{' '}
        จากทั้งหมด <span className="font-semibold text-slate-700">{totalCount}</span> รายการ
      </p>

      <div className="flex items-center gap-1">
        {/* Prev */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="หน้าก่อนหน้า"
        >
          <ChevronLeft size={18} />
        </button>

        {pages.map((p, idx) =>
          p === '...' ? (
            <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 select-none">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-[2rem] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${p === currentPage
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              {p}
            </button>
          )
        )}

        {/* Next */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          onMouseEnter={() => onPrefetchPage && onPrefetchPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="หน้าถัดไป"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};

// ─── Main Tasks View ──────────────────────────────────────────────────────────
export const Tasks = () => {
  const { user } = useAuth();

  // Task data (paged)
  const [tasks, setTasks] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [allUsers, setAllUsers] = useState([]);

  // Filters
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [filterUser, setFilterUser] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [localSearch, setLocalSearch] = useState('');
  const [localStartDate, setLocalStartDate] = useState('');
  const [localEndDate, setLocalEndDate] = useState('');

  // Debounce search input to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearch);
    }, 1200);
    return () => clearTimeout(timer);
  }, [localSearch]);

  // Summary modals
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isMonthlySummaryOpen, setIsMonthlySummaryOpen] = useState(false);
  // Keep all tasks for summary modals (fetched once on mount)
  const [allTasksForSummary, setAllTasksForSummary] = useState([]);

  // ─── User info ──────────────────────────────────────────────────────────────
  const userRole = user?.Role || user?.role;
  const userName = user?.Name || user?.name;
  const userDept = user?.Department || user?.department;
  const isAdmin = userRole === 'Admin';
  const isHRHead = userRole === 'Head' && userDept === 'HR';
  const canSeeAll = isAdmin || isHRHead;

  // ─── Permissions ────────────────────────────────────────────────────────────
  const DEFAULT_PERMS = { showDailySummary: true, showMonthlySummary: true, showFullTaskDetail: true };
  const userPerms = user?.Permissions && typeof user.Permissions === 'object'
    ? { ...DEFAULT_PERMS, ...user.Permissions }
    : DEFAULT_PERMS;

  // ─── Derived filter lists ────────────────────────────────────────────────────
  const uniqueDepartments = [...new Set(allUsers.map(u => u.Department))].filter(Boolean);
  const filteredUsers = allUsers.filter(u => {
    if (userRole === 'Head' && !canSeeAll && u.Department !== userDept) return false;
    return filterDepartment === 'All' || u.Department === filterDepartment;
  });

  const uniqueUsersMap = new Map();
  filteredUsers.forEach(u => {
    if (u.ID && u.Name) uniqueUsersMap.set(u.ID, u.Name);
  });
  
  const uniqueUserOptions = Array.from(uniqueUsersMap.entries()).map(([id, name]) => ({
    label: name,
    value: id
  }));

  const hasActiveFilter = searchQuery || localStartDate || localEndDate ||
    filterDepartment !== 'All' || filterUser !== 'All' || filterStatus !== 'All';

  // ─── Fetch helpers ───────────────────────────────────────────────────────────
  const buildFilters = useCallback(() => ({
    keyword: searchQuery,
    status: filterStatus,
    department: filterDepartment,
    user: filterUser,
    startDate: localStartDate,
    endDate: localEndDate,
    userRole,
    userName,
    userDept,
    userId: String(user?.ID || user?.id || ''),
  }), [searchQuery, filterStatus, filterDepartment, filterUser, localStartDate, localEndDate, userRole, userName, userDept, user]);

  const fetchPage = useCallback(async (page, isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const result = await apiService.getTasksPaged(page, ITEMS_PER_PAGE, buildFilters());
      setTasks(result.tasks || []);
      setTotalCount(result.totalCount || 0);
      setTotalPages(result.totalPages || 1);
      setCurrentPage(result.currentPage || page);
    } catch (error) {
      console.error(error);
      toast.error('ไม่สามารถดึงข้อมูลได้');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [buildFilters]);

  // Initial mount: also fetch users list and all tasks for summary modals
  useEffect(() => {
    let isMounted = true;
    fetchPage(1);

    // Fetch user list for filter dropdowns (Admins/Heads only)
    if (canSeeAll || userRole === 'Head') {
      apiService.getUsers().then(data => { if (isMounted) setAllUsers(data); }).catch(() => { });
    }

    // Fetch summary task list (lightweight) once for modals
    const fetchSummary = () => {
      apiService.getTasksSummary().then(data => {
        if (isMounted) setAllTasksForSummary(data || []);
      }).catch(() => { });
    };
    
    fetchSummary();

    window.addEventListener('tasks-optimistic-update', fetchSummary);
    window.addEventListener('cache-cleared', fetchSummary);

    return () => {
      isMounted = false;
      window.removeEventListener('tasks-optimistic-update', fetchSummary);
      window.removeEventListener('cache-cleared', fetchSummary);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch page 1 whenever any filter changes
  useEffect(() => {
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filterStatus, filterDepartment, filterUser, localStartDate, localEndDate]);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    fetchPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ─── Task CRUD ───────────────────────────────────────────────────────────────
  const handleEditTask = async (taskSummary) => {
    setLoading(true);
    try {
      const fullTask = await apiService.getTaskById(taskSummary.ID);
      setEditingTask(fullTask);
      setIsModalOpen(true);
    } catch {
      toast.error('ไม่สามารถโหลดข้อมูลงานฉบับเต็มได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTask = async (taskData) => {
    try {
      const payload = {
        ...taskData,
        UserID: String(user?.ID || user?.id || ''),
        StaffName: user?.Name || user?.name || 'Unknown',
        Department: user?.Department || 'Unknown',
      };

      if (editingTask) {
        // Optimistic Edit
        const oldTask = tasks.find(t => t.ID === payload.ID);
        setTasks(prev => prev.map(t => t.ID === payload.ID ? { ...t, ...payload, syncState: 'syncing' } : t));
        apiService.mutateSummaryCache('update', payload);
        setIsModalOpen(false);

        try {
          await apiService.updateTask(payload);
          setTasks(prev => prev.map(t => t.ID === payload.ID ? { ...t, syncState: 'success' } : t));
          setTimeout(() => {
             setTasks(prev => prev.map(t => t.ID === payload.ID ? { ...t, syncState: null } : t));
          }, 1500);
          toast.success('อัปเดตงานเรียบร้อย');
        } catch (error) {
          // Rollback
          setTasks(prev => prev.map(t => t.ID === payload.ID ? oldTask : t));
          toast.error('เกิดข้อผิดพลาดในการบันทึก: ' + error.message);
        }
      } else {
        // Optimistic Add
        const tempId = 'temp-' + Date.now();
        const newTask = { ...payload, ID: tempId, CreatedAt: new Date().toISOString(), syncState: 'pending' };
        setTasks(prev => [newTask, ...prev]);
        apiService.mutateSummaryCache('add', newTask);
        setIsModalOpen(false);

        try {
          await apiService.addTask(payload);
          setTasks(prev => prev.map(t => t.ID === tempId ? { ...t, syncState: 'success' } : t));
          setTimeout(() => {
            // To ensure IDs and timestamps match server, silently refetch after the indicator finishes
            fetchPage(1, true);
          }, 1500);
          toast.success('เพิ่มงานเรียบร้อย');
        } catch (error) {
          // Rollback
          setTasks(prev => prev.filter(t => t.ID !== tempId));
          toast.error('เกิดข้อผิดพลาดในการเพิ่มงาน: ' + error.message);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error('เกิดข้อผิดพลาดในการสร้าง payload');
    }
  };

  const requestDelete = (id) => setDeleteConfirmId(id);

  const handleDeleteTask = async () => {
    if (!deleteConfirmId) return;
    
    // Optimistic Delete
    const targetId = deleteConfirmId;
    setTasks(prev => prev.filter(t => t.ID !== targetId));
    apiService.mutateSummaryCache('delete', targetId);
    setDeleteConfirmId(null);
    
    try {
      await apiService.deleteTask(targetId);
      toast.success('ลบงานเรียบร้อย');
      const newPage = tasks.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      if (newPage !== currentPage) fetchPage(newPage, true);
    } catch (error) {
      console.error(error);
      toast.error('บันทึกล้มเหลว (ลองใหม่อีกครั้ง)');
      fetchPage(currentPage, true); // Rollback by silently refetching
    }
  };

  // ─── Status colors ───────────────────────────────────────────────────────────
  const statusColors = {
    'ยังไม่เริ่ม': 'bg-slate-100 text-slate-800 border border-slate-300',
    'กำลังทำ': 'bg-blue-100 text-blue-800 border-2 border-blue-400',
    'รอตรวจ': 'bg-purple-100 text-purple-800 border-2 border-purple-400',
    'รอแก้ไข': 'bg-amber-100 text-amber-800 border-2 border-amber-400',
    'เสร็จสิ้น': 'bg-green-100 text-green-800 border-2 border-green-500 shadow-sm font-bold',
    'ล่าช้า': 'bg-red-100 text-red-800 border-2 border-red-500 shadow-sm font-bold',
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">จัดการงาน</h2>
          <p className="text-slate-500">จัดการข้อมูลบันทึกงานประจำวันของคุณ</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {userPerms.showDailySummary && (
          <button
            onClick={() => setIsSummaryOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-medium transition-all shadow-sm focus:ring-4 focus:ring-indigo-100"
          >
            <Calendar size={20} />
            <span className="hidden sm:inline">สรุปงานวันนี้</span>
          </button>
          )}
          {userPerms.showMonthlySummary && (
          <button
            onClick={() => setIsMonthlySummaryOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl font-medium transition-all shadow-sm focus:ring-4 focus:ring-sky-100"
          >
            <PieChart size={20} />
            <span className="hidden sm:inline">สรุปรายเดือน</span>
          </button>
          )}
          <button
            onClick={() => { setEditingTask(null); setIsModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-sm focus:ring-4 focus:ring-blue-100"
          >
            <Plus size={20} />
            <span>เพิ่มงานใหม่</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-end relative z-20">
        <div className="flex-1 w-full relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="ค้นหางาน หรือชื่อโปรเจค..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        <div className="w-full md:w-auto flex flex-col sm:flex-row gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 font-medium whitespace-nowrap">ตั้งแต่:</span>
            <CustomDatePicker selectedDate={localStartDate} onChange={(date) => setLocalStartDate(date)} className="sm:w-36" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 font-medium whitespace-nowrap">ถึง:</span>
            <CustomDatePicker selectedDate={localEndDate} onChange={(date) => setLocalEndDate(date)} className="sm:w-36" />
          </div>

          {(canSeeAll || userRole === 'Head') && (
            <div className="flex items-center gap-2 flex-wrap">
              {canSeeAll && (
                <CustomSelect
                  value={filterDepartment}
                  onChange={(val) => { setFilterDepartment(val); setFilterUser('All'); }}
                  options={['All', ...uniqueDepartments].map(d => ({ label: d === 'All' ? 'ทุกแผนก' : d, value: d }))}
                  className="w-full sm:w-36"
                />
              )}
              <CustomSelect
                value={filterUser}
                onChange={(val) => setFilterUser(val)}
                options={[{ label: 'พนง.ทั้งหมด', value: 'All' }, ...uniqueUserOptions]}
                className="w-full sm:w-40"
              />
            </div>
          )}

          <CustomSelect
            value={filterStatus}
            onChange={(val) => setFilterStatus(val)}
            options={['All', ...Object.keys(statusColors)].map(s => ({ label: s === 'All' ? 'งานทั้งหมด' : s, value: s }))}
            className="w-full sm:w-48"
          />

          {hasActiveFilter && (
            <button
              onClick={() => {
                setLocalSearch('');
                setSearchQuery('');
                setLocalStartDate('');
                setLocalEndDate('');
                setFilterDepartment('All');
                setFilterUser('All');
                setFilterStatus('All');
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors shrink-0"
              title="ล้างตัวกรองทั้งหมด"
            >
              <X size={16} />
              <span className="hidden sm:inline">ล้างตัวกรอง</span>
            </button>
          )}
        </div>
      </div>

      <LoadingModal isOpen={loading} message="กำลังดึงข้อมูลงาน..." />

      {!loading && (
        <div className="space-y-4">
          {tasks.length === 0 ? (
            <div className="glass p-12 text-center rounded-2xl">
              <LayoutList className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-2 text-sm font-semibold text-slate-900">ไม่พบข้อมูลงาน</h3>
              <p className="mt-1 text-sm text-slate-500">เริ่มจดบันทึกงานโดยการกดปุ่มเพิ่มงานใหม่</p>
            </div>
          ) : (
            <>
              {tasks.map(task => (
                <div key={task.ID} className={`glass px-4 py-3 rounded-2xl border transition-all group flex flex-col md:flex-row gap-4 relative ${
                  task.syncState === 'pending' ? 'opacity-70 border-blue-200' : 'border-slate-200/60 hover:shadow-md'
                }`}>
                  
                  {/* Sync Indicators */}
                  {task.syncState === 'pending' && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 animate-pulse">
                      🚩 กำลังบันทึก...
                    </div>
                  )}
                  {task.syncState === 'syncing' && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                      <RefreshCw size={10} className="animate-spin" /> กำลังซิงค์...
                    </div>
                  )}
                  {task.syncState === 'success' && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200">
                      <CheckCircle2 size={10} /> อัปเดตแล้ว
                    </div>
                  )}

                  <div className="flex-1 space-y-1.5 pt-4 md:pt-0">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-1 pr-4 flex-1 min-w-0">
                        {task.CustomFields?.Project && (
                          <span className="text-sm font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg self-start border border-indigo-100 leading-tight">
                            {task.CustomFields.Project}
                          </span>
                        )}
                        {userPerms.showFullTaskDetail ? (
                          <h3 className="text-xs text-slate-600 line-clamp-3 leading-relaxed mt-2" title={task.Detail}>{task.Detail}</h3>
                        ) : (
                          <div className="h-2"></div> 
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 mt-2 md:mt-0 pt-2 lg:pt-0">
                        <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${statusColors[task.Status]}`}>
                          {task.Status}
                        </span>
                        {apiService.isOverdue(task) && (
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${statusColors['ล่าช้า']}`}>
                            ล่าช้า
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-5 pt-2 border-t border-slate-50">
                      <div className="flex items-center gap-1">
                        <Calendar size={13} />
                        <span>กำหนดส่ง: วัน{format(new Date(task.DueDate), "eeeeที่ d MMMM yyyy", { locale: th })}</span>
                      </div>
                      <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 rounded-md">
                        <span className="font-medium text-slate-700">{task.StaffName}</span>
                      </div>
                    </div>

                    {userPerms.showFullTaskDetail && task.CustomFields && Object.keys(task.CustomFields).length > 0 && (
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                        {Object.entries(task.CustomFields).filter(([k]) => k !== 'Images' && k !== 'Project').map(([key, value]) => (
                          <div key={key} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50/50 border border-blue-100 rounded-lg text-[11px] text-blue-800">
                            <span className="font-semibold">{key}:</span> {value}
                          </div>
                        ))}
                      </div>
                    )}

                    {task.HasImages && (
                      <div className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-md max-w-max border border-green-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        มีรูปภาพแนบ
                      </div>
                    )}
                  </div>

                  <div className="flex flex-row md:flex-col gap-2 justify-end">
                    <button
                      onClick={() => handleEditTask(task)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => requestDelete(task.ID)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}

              {/* ── Pagination ── */}
              <div className="glass p-4 rounded-2xl border border-slate-200 shadow-sm">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalCount={totalCount}
                  pageSize={ITEMS_PER_PAGE}
                  onPageChange={handlePageChange}
                  onPrefetchPage={(page) => {
                    if (page <= totalPages) {
                      apiService.getTasksPaged(page, ITEMS_PER_PAGE, buildFilters()).catch(() => {});
                    }
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {isModalOpen && (
        <TaskModal
          task={editingTask}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveTask}
          closeOnOutsideClick={false}
        />
      )}

      <DailySummaryModal
        isOpen={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
        tasks={allTasksForSummary}
        user={user}
        closeOnOutsideClick={false}
      />

      <MonthlySummaryModal
        isOpen={isMonthlySummaryOpen}
        onClose={() => setIsMonthlySummaryOpen(false)}
        tasks={allTasksForSummary}
        user={user}
        closeOnOutsideClick={false}
      />

      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={handleDeleteTask}
        title="ยืนยันการลบข้อมูล"
        message="คุณมั่นใจหรือไม่ว่าต้องการลบงานนี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้"
        type="danger"
        closeOnOutsideClick={false}
      />
    </div>
  );
};
