import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, Calendar, LayoutList, PieChart, X, ChevronLeft, ChevronRight, RefreshCw, CheckCircle2, ChevronDown, Settings, List, LayoutGrid } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { format, startOfMonth, endOfMonth } from 'date-fns';
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

  // UI Settings & View Modes
  const [uiSettings, setUiSettings] = useState(() => {
    const saved = localStorage.getItem('tasks_ui_settings');
    if (saved) return JSON.parse(saved);
    return {
      defaultView: 'list', // 'list' | 'table'
      showCardDetail: true,
      showTableDetail: false,
    };
  });
  const [viewMode, setViewMode] = useState(uiSettings.defaultView);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Task data (paged)
  const [tasks, setTasks] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [openStatusId, setOpenStatusId] = useState(null);

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

  const handleSaveSettings = (newSettings) => {
    setUiSettings(newSettings);
    localStorage.setItem('tasks_ui_settings', JSON.stringify(newSettings));
    toast.success('บันทึกการตั้งค่าเรียบร้อยแล้ว');
  };

  // ─── Derived filter lists ────────────────────────────────────────────────────
  const uniqueDepartments = [...new Set(allUsers.map(u => u.Department))].filter(Boolean);
  const filteredUsers = allUsers.filter(u => {
    if (userRole === 'Head' && !canSeeAll && u.Department !== userDept) return false;
    if (u.Role === 'Admin') return false;
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

  // Lock to current month when switching to Table View
  useEffect(() => {
    if (viewMode === 'table') {
      const now = new Date();
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      setLocalStartDate(format(start, 'yyyy-MM-dd'));
      setLocalEndDate(format(end, 'yyyy-MM-dd'));
    }
  }, [viewMode]);

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
    
    setIsDeleting(true);
    const targetId = deleteConfirmId;
    
    try {
      await apiService.deleteTask(targetId);
      
      // Update local state after success
      setTasks(prev => prev.filter(t => t.ID !== targetId));
      apiService.mutateSummaryCache('delete', targetId);
      
      toast.success('ลบงานเรียบร้อย');
      const newPage = tasks.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
      if (newPage !== currentPage) fetchPage(newPage, true);
      
      setDeleteConfirmId(null);
    } catch (error) {
      console.error(error);
      toast.error('ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsDeleting(false);
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

  const handleStatusChange = async (task, newStatus) => {
    const oldStatus = task.Status;
    try {
      setTasks(prev => prev.map(t => t.ID === task.ID ? { ...t, Status: newStatus, syncState: 'syncing' } : t));
      apiService.mutateSummaryCache('update', { ID: task.ID, Status: newStatus });
      await apiService.updateTask({ ID: task.ID, Status: newStatus });
      setTasks(prev => prev.map(t => t.ID === task.ID ? { ...t, syncState: 'success' } : t));
      setTimeout(() => {
        setTasks(prev => prev.map(t => t.ID === task.ID ? { ...t, syncState: null } : t));
      }, 1500);
      toast.success('อัปเดตสถานะเป็น ' + newStatus + ' เรียบร้อย');
    } catch (error) {
      setTasks(prev => prev.map(t => t.ID === task.ID ? { ...t, Status: oldStatus, syncState: null } : t));
      toast.error('อัปเดตสถานะไม่สำเร็จ: ' + error.message);
    }
  };

  const StatusDropdown = ({ task, currentStatus, isOpen, onToggle }) => {
    const dropdownRef = React.useRef(null);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
          if (isOpen) onToggle(null);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onToggle]);

    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => onToggle(isOpen ? null : task.ID)}
          className={`px-2.5 py-0.5 text-xs font-semibold rounded-full flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity border-2 shadow-sm ${statusColors[currentStatus] || statusColors['ยังไม่เริ่ม']}`}
        >
          <span>{currentStatus}</span>
          <ChevronDown size={12} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {isOpen && (
          <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-xl shadow-xl border border-slate-200 p-1 py-1.5 z-[110]">
            {Object.entries(statusColors).map(([status, color]) => (
              <button
                key={status}
                onClick={() => {
                  onToggle(null);
                  if (status !== currentStatus) handleStatusChange(task, status);
                }}
                className="w-full text-left px-2 py-1.5 text-[11px] font-medium rounded-lg hover:bg-slate-50 transition-colors mb-0.5 last:mb-0 flex items-center gap-1.5"
              >
                <div className={`w-2 h-2 rounded-full ${color.split(' ')[0]}`}></div>
                {status}
              </button>
            ))}
          </div>
        )}
      </div>
    );
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
          {/* View Toggles & Settings */}
          <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex items-center">
            <button 
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="มุมมองการ์ด"
            >
              <LayoutGrid size={20} />
            </button>
            <button 
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="มุมมองตาราง"
            >
              <List size={20} />
            </button>
            <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>
            <button 
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2 rounded-lg transition-all text-slate-400 hover:text-blue-600 hover:bg-blue-50"
              title="ตั้งค่าการแสดงผล"
            >
              <Settings size={20} />
            </button>
          </div>

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
      <div className="glass p-4 rounded-2xl border-2 border-dashed border-slate-400 flex flex-col md:flex-row gap-4 items-end relative z-20">
        <div className="flex-1 w-full relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="ค้นหางาน หรือชื่อโปรเจค..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border-2 border-dashed border-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        <div className="w-full md:w-auto flex flex-col sm:flex-row gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 font-medium whitespace-nowrap">ตั้งแต่:</span>
            <CustomDatePicker selectedDate={localStartDate} onChange={(date) => setLocalStartDate(date)} className="sm:w-36" borderDashed />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 font-medium whitespace-nowrap">ถึง:</span>
            <CustomDatePicker selectedDate={localEndDate} onChange={(date) => setLocalEndDate(date)} className="sm:w-36" borderDashed />
          </div>

          {(canSeeAll || userRole === 'Head') && (
            <div className="flex items-center gap-2 flex-wrap text-black">
              {canSeeAll && (
                <CustomSelect
                  value={filterDepartment}
                  borderDashed
                  onChange={(val) => { setFilterDepartment(val); setFilterUser('All'); }}
                  options={['All', ...uniqueDepartments].map(d => ({ label: d === 'All' ? 'ทุกแผนก' : d, value: d }))}
                  className="w-full sm:w-36"
                />
              )}
              <CustomSelect
                value={filterUser}
                borderDashed
                onChange={(val) => setFilterUser(val)}
                options={[{ label: 'พนง.ทั้งหมด', value: 'All' }, ...uniqueUserOptions]}
                className="w-full sm:w-40"
              />
            </div>
          )}

          <CustomSelect
            value={filterStatus}
            borderDashed
            onChange={(val) => setFilterStatus(val)}
            options={['All', ...Object.keys(statusColors).filter(s => s !== 'ล่าช้า' && s !== 'เกินกำหนด')].map(s => ({ label: s === 'All' ? 'งานทั้งหมด' : s, value: s }))}
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
          ) : viewMode === 'list' ? (
            <>
              {tasks.map(task => (
                <div key={task.ID} className={`glass px-4 py-3 rounded-2xl border-2 border-dashed shadow-md transition-all group flex flex-col md:flex-row gap-4 relative ${
                  openStatusId === task.ID ? 'z-50 shadow-2xl border-blue-400' : 'z-0 border-slate-300 hover:border-blue-400'
                } ${task.syncState === 'pending' ? 'opacity-70 border-blue-200' : 'hover:shadow-xl hover:shadow-blue-500/10'}`}>
                  
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
                        {uiSettings.showCardDetail ? (
                          <h3 className="text-xs text-slate-600 line-clamp-3 leading-relaxed mt-2" title={task.Detail}>{task.Detail}</h3>
                        ) : (
                          <div className="h-2"></div> 
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 mt-2 md:mt-0 pt-2 lg:pt-0">
                        <StatusDropdown 
                          task={task} 
                          currentStatus={task.Status} 
                          isOpen={openStatusId === task.ID}
                          onToggle={setOpenStatusId}
                        />
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

                    {uiSettings.showCardDetail && task.CustomFields && Object.keys(task.CustomFields).length > 0 && (
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
              <div className="glass p-4 rounded-2xl border border-slate-200 shadow-sm mt-4">
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
          ) : (
            <div className="glass overflow-hidden rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/30 transition-all animate-in fade-in duration-500">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200/60 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-16 text-center">ลำดับ</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">รายละเอียดงาน</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-32">กำหนดส่ง</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-36">สถานะ</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right pr-6 w-28">เครื่องมือ</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {tasks.map((task, index) => {
                      const rowNumber = totalCount - ((currentPage - 1) * ITEMS_PER_PAGE) - index;
                      return (
                        <tr key={task.ID} className="hover:bg-blue-50/20 transition-colors group border-b border-slate-100 last:border-0">
                          <td className="px-4 py-3 text-center">
                            <span className="text-[11px] font-bold text-slate-400">{rowNumber}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1 max-w-xl">
                               <div className="flex items-center gap-2 flex-wrap">
                                 <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                                   {task.CustomFields?.Project || 'ทั่วไป'}
                                 </span>
                                 
                                 {/* รายละเอียดเพิ่มเติมตามตำแหน่ง (แสดงแบบบรรทัดเดียว) */}
                                 {task.CustomFields && Object.keys(task.CustomFields).some(k => k !== 'Images' && k !== 'Project') && (
                                   <div className="flex items-center gap-1.5 overflow-hidden">
                                     {Object.entries(task.CustomFields).filter(([k]) => k !== 'Images' && k !== 'Project').map(([key, value]) => (
                                       <span key={key} className="text-[10px] text-slate-500 whitespace-nowrap bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                         <span className="font-bold">{key}:</span> {value}
                                       </span>
                                     ))}
                                   </div>
                                 )}
                               </div>
                               
                               {/* รายละเอียดหลัก (แสดงเมื่อเปิดตั้งค่า) */}
                               {uiSettings.showTableDetail && task.Detail && (
                                 <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 opacity-80">
                                   {task.Detail}
                                 </p>
                               )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                             <div className="flex flex-col items-center">
                                <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                                   <Calendar size={12} className="text-blue-500" />
                                   {format(new Date(task.DueDate), 'dd/MM/yyyy', { locale: th })}
                                </div>
                                <span className="text-[9px] text-slate-400 font-medium px-1.5 bg-slate-50 rounded border border-slate-100 mt-0.5">
                                   {task.StaffName}
                                </span>
                             </div>
                          </td>
                          <td className="px-4 py-3">
                             <div className="flex justify-center scale-90 origin-center">
                              <StatusDropdown 
                                task={task} 
                                currentStatus={task.Status} 
                                isOpen={openStatusId === task.ID}
                                onToggle={setOpenStatusId}
                              />
                             </div>
                          </td>
                          <td className="px-4 py-3 text-right pr-6">
                             <div className="flex justify-end gap-1.5">
                                <button 
                                  onClick={() => handleEditTask(task)}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                                  title="แก้ไข"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button 
                                  onClick={() => requestDelete(task.ID)}
                                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                                  title="ลบ"
                                >
                                  <Trash2 size={14} />
                                </button>
                             </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-slate-50/30 p-4 border-t border-slate-100">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalCount={totalCount}
                  pageSize={ITEMS_PER_PAGE}
                  onPageChange={handlePageChange}
                />
              </div>
            </div>
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

      {isSettingsModalOpen && (
        <TasksSettingsModal
          onClose={() => setIsSettingsModalOpen(false)}
          settings={uiSettings}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
};

// ─── Settings Modal Component ────────────────────────────────────────────────
const TasksSettingsModal = ({ onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState(settings);

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800">การตั้งค่ามุมมอง</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200/50 rounded-full transition-colors text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700">มุมมองเริ่มต้น</label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setLocalSettings(prev => ({ ...prev, defaultView: 'list' }))}
                className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  localSettings.defaultView === 'list' 
                    ? 'border-blue-600 bg-blue-50 text-blue-700' 
                    : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200 shadow-inner'
                }`}
              >
                <LayoutGrid size={20} />
                <span className="font-bold text-xs">แบบการ์ด</span>
              </button>
              <button 
                onClick={() => setLocalSettings(prev => ({ ...prev, defaultView: 'table' }))}
                className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  localSettings.defaultView === 'table' 
                    ? 'border-blue-600 bg-blue-50 text-blue-700' 
                    : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200 shadow-inner'
                }`}
              >
                <List size={20} />
                <span className="font-bold text-xs">แบบตาราง</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-sm font-bold text-slate-700">รายละเอียดเพิ่มเติม</label>
            
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                   <List size={16} className="text-slate-400" />
                </div>
                <p className="text-sm font-bold text-slate-700">แสดงในมุมมองตาราง</p>
              </div>
              <button 
                onClick={() => setLocalSettings(prev => ({ ...prev, showTableDetail: !prev.showTableDetail }))}
                className={`w-12 h-6 rounded-full transition-all relative ${localSettings.showTableDetail ? 'bg-blue-600' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${localSettings.showTableDetail ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200/50 rounded-xl transition-colors"
          >
            ยกเลิก
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95"
          >
            บันทึกการตั้งค่า
          </button>
        </div>
      </div>
    </div>
  );
};
