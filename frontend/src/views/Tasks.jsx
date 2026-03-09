import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Calendar, LayoutList, PieChart, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
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
const Pagination = ({ currentPage, totalPages, totalCount, pageSize, onPageChange }) => {
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

  // ─── Derived filter lists ────────────────────────────────────────────────────
  const uniqueDepartments = [...new Set(allUsers.map(u => u.Department))].filter(Boolean);
  const uniqueUsers = [...new Set(
    allUsers.filter(u => {
      if (userRole === 'Head' && !canSeeAll && u.Department !== userDept) return false;
      return filterDepartment === 'All' || u.Department === filterDepartment;
    }).map(u => u.Name)
  )].filter(Boolean);

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

  const fetchPage = useCallback(async (page) => {
    setLoading(true);
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
      setLoading(false);
    }
  }, [buildFilters]);

  // Initial mount: also fetch users list and all tasks for summary modals
  useEffect(() => {
    fetchPage(1);

    // Fetch user list for filter dropdowns (Admins/Heads only)
    if (canSeeAll || userRole === 'Head') {
      apiService.getUsers().then(setAllUsers).catch(() => { });
    }

    // Fetch summary task list (lightweight) once for modals
    apiService.getTasksSummary().then(data => {
      setAllTasksForSummary(data || []);
    }).catch(() => { });
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
        await apiService.updateTask(payload);
        toast.success('อัปเดตงานเรียบร้อย');
      } else {
        await apiService.addTask(payload);
        toast.success('เพิ่มงานเรียบร้อย');
      }
      setIsModalOpen(false);
      fetchPage(currentPage);
      // Refresh summary list too
      apiService.getTasksSummary().then(data => setAllTasksForSummary(data || [])).catch(() => { });
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการบันทึก: ' + error.message);
    }
  };

  const requestDelete = (id) => setDeleteConfirmId(id);

  const handleDeleteTask = async () => {
    if (!deleteConfirmId) return;
    setLoading(true);
    try {
      await apiService.deleteTask(deleteConfirmId);
      toast.success('ลบงานเรียบร้อย');
      // If deleting the last item on this page, go back one page
      const newPage = tasks.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      fetchPage(newPage);
      apiService.getTasksSummary().then(data => setAllTasksForSummary(data || [])).catch(() => { });
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการลบ: ' + error.message);
      setLoading(false);
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
          <button
            onClick={() => setIsSummaryOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-medium transition-all shadow-sm focus:ring-4 focus:ring-indigo-100"
          >
            <Calendar size={20} />
            <span className="hidden sm:inline">สรุปงานวันนี้</span>
          </button>
          <button
            onClick={() => setIsMonthlySummaryOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl font-medium transition-all shadow-sm focus:ring-4 focus:ring-sky-100"
          >
            <PieChart size={20} />
            <span className="hidden sm:inline">สรุปรายเดือน</span>
          </button>
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
            placeholder="ค้นหางาน..."
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
                options={['All', ...uniqueUsers].map(u => ({ label: u === 'All' ? 'พนง.ทั้งหมด' : u, value: u }))}
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
                <div key={task.ID} className="glass p-5 rounded-2xl border border-slate-200/60 hover:shadow-md transition-shadow group flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col gap-1.5 pr-6">
                        {task.CustomFields?.Project && (
                          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md self-start border border-indigo-100">
                            โปรเจค: {task.CustomFields.Project}
                          </span>
                        )}
                        <h3 className="text-base font-bold text-slate-900 line-clamp-2" title={task.Detail}>{task.Detail}</h3>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-full ${statusColors[task.Status]}`}>
                          {task.Status}
                        </span>
                        {apiService.isOverdue(task) && (
                          <span className={`shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-md ${statusColors['ล่าช้า']}`}>
                            ล่าช้า
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={16} />
                        <span>กำหนดส่ง: {format(new Date(task.DueDate), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 rounded-md">
                        <span className="font-medium text-slate-700">{task.StaffName}</span>
                      </div>
                    </div>

                    {task.CustomFields && Object.keys(task.CustomFields).length > 0 && (
                      <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                        {Object.entries(task.CustomFields).filter(([k]) => k !== 'Images' && k !== 'Project').map(([key, value]) => (
                          <div key={key} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-blue-800">
                            <span className="font-semibold">{key}:</span> {value}
                          </div>
                        ))}
                      </div>
                    )}

                    {task.HasImages && (
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-md max-w-max border border-green-100 mt-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        มีรูปภาพแนบ
                      </div>
                    )}
                  </div>

                  <div className="flex flex-row md:flex-col gap-2 justify-end mt-4 md:mt-0">
                    <button
                      onClick={() => handleEditTask(task)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => requestDelete(task.ID)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
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
        />
      )}

      <DailySummaryModal
        isOpen={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
        tasks={allTasksForSummary}
        user={user}
      />

      <MonthlySummaryModal
        isOpen={isMonthlySummaryOpen}
        onClose={() => setIsMonthlySummaryOpen(false)}
        tasks={allTasksForSummary}
        user={user}
      />

      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={handleDeleteTask}
        title="ยืนยันการลบข้อมูล"
        message="คุณมั่นใจหรือไม่ว่าต้องการลบงานนี้? การดำเนินการนี้ไม่สามารถย้อนกลับได้"
        type="danger"
      />
    </div>
  );
};
