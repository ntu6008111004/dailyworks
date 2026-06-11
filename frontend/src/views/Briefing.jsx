import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, Edit2, Trash2, Calendar, LayoutList, PieChart, X, ChevronLeft, ChevronRight, RefreshCw, CheckCircle2, AlertCircle, Clock, NotebookTabs, FilterX, Settings, List, LayoutGrid, Users, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { LoadingModal } from '../components/LoadingModal';
import { CustomSelect } from '../components/CustomSelect';
import { CustomDatePicker } from '../components/CustomDatePicker';
import { BriefingModal } from '../components/BriefingModal';
import { BriefingTimeline } from '../components/BriefingTimeline';

export const Briefing = () => {
  const { user } = useAuth();
  const [briefings, setBriefings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  
  // UI Settings & Persistence
  const [uiSettings, setUiSettings] = useState(() => {
    const saved = localStorage.getItem('briefing_ui_settings');
    return saved ? JSON.parse(saved) : {
      defaultView: 'list',
      itemsPerPage: 10
    };
  });

  useEffect(() => {
    localStorage.setItem('briefing_ui_settings', JSON.stringify(uiSettings));
  }, [uiSettings]);

  // UI States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingBriefing, setEditingBriefing] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewMode, setViewMode] = useState(uiSettings.defaultView); // 'list', 'table', or 'timeline'

  // Filters
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPostStatus, setFilterPostStatus] = useState('All');
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [filterUser, setFilterUser] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [openStatusId, setOpenStatusId] = useState(null);

  const itemsPerPage = uiSettings.itemsPerPage;

  const userRole = user?.Role || user?.role;
  const isAdmin = userRole === 'Admin';
  const perms = user?.Permissions || {};
  const canCreate = isAdmin || perms.canCreateBriefing;

  useEffect(() => {
    fetchData();
    apiService.getUsers().then(setAllUsers).catch(() => {});
    apiService.migrateBriefingsAddFields().catch(() => {});
  }, []);


  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await apiService.getBriefings();
      setBriefings(data || []);
    } catch {
      toast.error('ไม่สามารถโหลดข้อมูลบรีฟได้', { position: 'bottom-right' });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      apiService.clearCache();
      const data = await apiService.getBriefings();
      setBriefings(data || []);
    } catch {
      if (!isSilent) toast.error('ไม่สามารถโหลดข้อมูลล่าสุดได้', { position: 'bottom-right' });
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    const onRemoteUpdate = () => {
      // Background poller detected an update. Fetch fresh data silently.
      handleRefresh(true);
    };
    window.addEventListener('remote-briefing-update', onRemoteUpdate);
    return () => window.removeEventListener('remote-briefing-update', onRemoteUpdate);
  }, []);

  const handleClearFilters = () => {
    setFilterStatus('All');
    setFilterPostStatus('All');
    setFilterDepartment('All');
    setFilterUser('All');
    setSearchTerm('');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    toast.success('ล้างตัวกรองทั้งหมดแล้ว', { position: 'bottom-right' });
  };
  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchTerm);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const visibleBriefings = useMemo(() => {
    return briefings.filter(b => {
      // Accessibility Logic: Admins see all, Heads see department, others see own/assigned
      const isCreator = String(b.CreatorID) === String(user?.ID);
      const isAssignee = b.Assignees?.some(id => String(id) === String(user?.ID));
      
      const creator = allUsers.find(u => String(u.ID) === String(b.CreatorID));
      const isDeptHead = user?.Role === 'Head' && creator?.Department === user?.Department;

      return isAdmin || isCreator || isAssignee || isDeptHead;
    });
  }, [briefings, user, isAdmin, allUsers]);

  const filteredBriefings = useMemo(() => {
    return visibleBriefings.filter(b => {
      // 2. Search Query
      if (searchQuery && !b.Detail?.toLowerCase().includes(searchQuery.toLowerCase()) && !b.RunningID?.toLowerCase().includes(searchQuery.toLowerCase())) return false;

      // 3. Status
      if (filterStatus === 'Overdue') {
        if (!apiService.isBriefingOverdue(b)) return false;
      } else if (filterStatus !== 'All' && b.Status !== filterStatus) {
        return false;
      }

      const pStatus = b.PostStatus || 'ยังไม่โพส';
      if (filterPostStatus !== 'All' && pStatus !== filterPostStatus) return false;

      // 4. Department (Based on Creator)
      if (filterDepartment !== 'All') {
        const creator = allUsers.find(u => String(u.ID) === String(b.CreatorID));
        if (creator?.Department !== filterDepartment) return false;
      }

      // 5. User (Creator or Assignee)
      if (filterUser !== 'All') {
        const isMatchedUser = String(b.CreatorID) === String(filterUser) || b.Assignees?.some(id => String(id) === String(filterUser));
        if (!isMatchedUser) return false;
      }

      // 6. Dates (Filter by DueDate)
      const bDate = b.DueDate || b.StartDate || b.CreatedAt;
      if (startDate && new Date(bDate) < new Date(startDate)) return false;
      if (endDate && new Date(bDate) > new Date(endDate)) return false;

      return true;
    }).sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
  }, [visibleBriefings, searchQuery, filterStatus, filterPostStatus, filterDepartment, filterUser, startDate, endDate, allUsers]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterPostStatus, filterDepartment, filterUser, startDate, endDate]);

  const totalPages = Math.ceil(filteredBriefings.length / itemsPerPage);
  const currentBriefings = filteredBriefings.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const stats = useMemo(() => {
    const total = visibleBriefings.length;
    const overdue = visibleBriefings.filter(b => apiService.isBriefingOverdue(b)).length;
    const byStatus = visibleBriefings.reduce((acc, b) => {
      acc[b.Status] = (acc[b.Status] || 0) + 1;
      return acc;
    }, {});
    const byPostStatus = visibleBriefings.reduce((acc, b) => {
      const p = b.PostStatus || 'ยังไม่โพส';
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {});

    return { total, overdue, byStatus, byPostStatus };
  }, [visibleBriefings]);

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    
    setIsDeleting(true);
    try {
      await apiService.deleteBriefing(deleteConfirmId);
      toast.success('ลบบรีฟงานเรียบร้อย', { position: 'bottom-right' });
      fetchData();
      setDeleteConfirmId(null);
    } catch {
      toast.error('ไม่สามารถลบบรีฟงานได้', { position: 'bottom-right' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (briefing, newStatus) => {
    const oldStatus = briefing.Status;
    try {
      setBriefings(prev => prev.map(b => b.ID === briefing.ID ? { ...b, Status: newStatus, syncState: 'syncing' } : b));
      await apiService.updateBriefing({ ID: briefing.ID, Status: newStatus });
      setBriefings(prev => prev.map(b => b.ID === briefing.ID ? { ...b, syncState: 'success' } : b));
      setTimeout(() => {
        setBriefings(prev => prev.map(b => b.ID === briefing.ID ? { ...b, syncState: null } : b));
      }, 1500);
      toast.success('อัปเดตสถานะเป็น ' + newStatus + ' เรียบร้อย');
    } catch (error) {
      setBriefings(prev => prev.map(b => b.ID === briefing.ID ? { ...b, Status: oldStatus, syncState: null } : b));
      toast.error('อัปเดตสถานะไม่สำเร็จ: ' + error.message);
    }
  };

  const handlePostStatusToggle = async (briefing) => {
    const pStatus = briefing.PostStatus || 'ยังไม่โพส';
    const newStatus = pStatus === 'ยังไม่โพส' ? 'โพสแล้ว' : 'ยังไม่โพส';
    const oldStatus = pStatus;
    const oldPostDate = briefing.PostDate;
    const newPostDate = newStatus === 'โพสแล้ว' ? new Date().toISOString().split('T')[0] : briefing.PostDate;

    try {
      setBriefings(prev => prev.map(b => b.ID === briefing.ID ? { ...b, PostStatus: newStatus, PostDate: newPostDate, syncState: 'syncing' } : b));
      await apiService.updateBriefing({ ID: briefing.ID, PostStatus: newStatus, PostDate: newPostDate });
      setBriefings(prev => prev.map(b => b.ID === briefing.ID ? { ...b, syncState: 'success' } : b));
      setTimeout(() => {
        setBriefings(prev => prev.map(b => b.ID === briefing.ID ? { ...b, syncState: null } : b));
      }, 1500);
      toast.success('อัปเดตสถานะโพสต์เป็น ' + newStatus);
    } catch (error) {
      setBriefings(prev => prev.map(b => b.ID === briefing.ID ? { ...b, PostStatus: oldStatus, PostDate: oldPostDate, syncState: null } : b));
      toast.error('อัปเดตสถานะโพสต์ไม่สำเร็จ: ' + error.message);
    }
  };

  const StatusDropdown = ({ briefing, currentStatus, isOpen, onToggle }) => {
    const dropdownRef = React.useRef(null);
    const buttonRef = React.useRef(null);
    const [dropdownStyles, setDropdownStyles] = useState({});

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (
          dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          buttonRef.current && !buttonRef.current.contains(event.target)
        ) {
          if (isOpen) onToggle(null);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onToggle]);

    useEffect(() => {
      const handleScrollOrResize = (e) => {
        if (!isOpen) return;
        if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
        onToggle(null);
      };

      if (isOpen) {
        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);
        
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          const spaceAbove = rect.top;
          const isDropUp = spaceBelow < 200 && spaceAbove > spaceBelow;
          
          setDropdownStyles({
            position: 'fixed',
            left: rect.left,
            top: isDropUp ? 'auto' : rect.bottom + 4,
            bottom: isDropUp ? window.innerHeight - rect.top + 4 : 'auto',
            width: 128,
            zIndex: 999999,
          });
        }
      }

      return () => {
        window.removeEventListener('scroll', handleScrollOrResize, true);
        window.removeEventListener('resize', handleScrollOrResize);
      };
    }, [isOpen, onToggle]);

    return (
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={(e) => { e.stopPropagation(); onToggle(isOpen ? null : briefing.ID); }}
          className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity border-2 shadow-sm ${statusColors[currentStatus] || statusColors['รอดำเนินการ']}`}
        >
          <span>{apiService.isBriefingOverdue(briefing) ? 'เกินกำหนด' : currentStatus}</span>
          <RefreshCw size={10} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {isOpen && createPortal(
          <div ref={dropdownRef} style={dropdownStyles} className="bg-white/90 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-200/60 p-1 py-1.5 z-[999999] animate-in fade-in zoom-in-95 duration-150">
            {Object.entries(statusColors).filter(([s]) => s !== 'Overdue').map(([status, color]) => (
              <button
                key={status}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(null);
                  if (status !== currentStatus) handleStatusChange(briefing, status);
                }}
                className="w-full text-left px-2 py-1.5 text-[11px] font-medium rounded-lg hover:bg-slate-100 transition-colors mb-0.5 last:mb-0 flex items-center gap-1.5"
              >
                <div className={`w-2 h-2 rounded-full ${color.split(' ')[0]}`}></div>
                {status}
              </button>
            ))}
          </div>,
          document.body
        )}
      </div>
    );
  };

  const statusColors = {
    'รอดำเนินการ': 'bg-slate-100 text-slate-700 border border-slate-200 font-bold',
    'กำลังทำ': 'bg-blue-100 text-blue-700 border border-blue-200 font-bold',
    'รอตรวจ': 'bg-pink-100 text-pink-700 border border-pink-200 font-bold',
    'รอแก้ไข': 'bg-yellow-100 text-yellow-800 border border-yellow-200 font-bold',
    'เสร็จสิ้น': 'bg-green-100 text-green-800 border border-green-200 font-bold',
    'ยกเลิกงาน': 'bg-zinc-100 text-zinc-600 border border-zinc-200 font-bold',
    'Overdue': 'bg-rose-100 text-rose-700 border border-rose-200 font-bold',
  };

  const priorityColors = {
    'สูง': 'text-red-500 bg-red-50',
    'กลาง': 'text-amber-500 bg-amber-50',
    'ต่ำ': 'text-blue-500 bg-blue-50',
    'High': 'text-red-500 bg-red-50', // Compatibility
    'Medium': 'text-amber-500 bg-amber-50',
    'Low': 'text-blue-500 bg-blue-50',
  };

  const PaginationSection = () => {
    if (totalPages <= 1 && filteredBriefings.length <= 10) return null;
    
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">แสดงหน้าละ:</span>
          <select 
            value={uiSettings.itemsPerPage}
            onChange={(e) => setUiSettings(prev => ({ ...prev, itemsPerPage: Number(e.target.value) }))}
            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {[10, 20, 30, 40, 50, 100].map(num => (
              <option key={num} value={num}>{num} รายการ</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-all bg-white shadow-sm"
          >
            <ChevronLeft size={18} />
          </button>
          
          <div className="flex items-center gap-1.5">
            <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-lg shadow-blue-200">{currentPage}</span>
            <span className="text-xs font-bold text-slate-400">/</span>
            <span className="text-xs font-bold text-slate-500">{totalPages || 1}</span>
          </div>

          <button 
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-all bg-white shadow-sm"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:block">
          ทั้งหมด {filteredBriefings.length} รายการ
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <LoadingModal isOpen={loading} message="กำลังโหลดข้อมูลบรีฟงาน..." />
      
      {/* Header & Stats */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <NotebookTabs className="text-blue-600" size={26} />
              ระบบบรีฟงาน (Briefing Work)
            </h2>
            <p className="text-slate-500">จัดการ แลกเปลี่ยน และติดตามงานบรีฟอย่างเป็นระบบ</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex">
               <button 
                onClick={() => {
                  handleRefresh();
                  toast.success('อัปเดตข้อมูลล่าสุดแล้ว', { position: 'bottom-right' });
                }}
                title="ดึงข้อมูลล่าสุด"
                className="p-2 rounded-lg transition-all text-slate-400 hover:text-blue-600 hover:bg-blue-50"
               >
                 <RefreshCw size={20} />
               </button>
               <div className="w-[1px] bg-slate-200 mx-1 my-2"></div>
               <button 
                onClick={() => setViewMode('list')}
                title="มุมมองการ์ด"
                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
               >
                 <LayoutGrid size={20} />
               </button>
               <button 
                onClick={() => setViewMode('table')}
                title="มุมมองตาราง"
                className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
               >
                 <List size={20} />
               </button>
               <button 
                onClick={() => setViewMode('timeline')}
                title="มุมมองไทม์ไลน์"
                className={`p-2 rounded-lg transition-all ${viewMode === 'timeline' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
               >
                 <Calendar size={20} />
               </button>
               <div className="w-[1px] bg-slate-200 mx-1 my-2"></div>
               <button 
                onClick={() => setIsSettingsOpen(true)}
                title="ตั้งค่าแสดงผล"
                className="p-2 rounded-lg transition-all text-slate-400 hover:text-blue-600 hover:bg-blue-50"
               >
                 <Settings size={20} />
               </button>
            </div>
            <button 
              onClick={handleClearFilters}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-red-50 text-red-600 border border-red-100 rounded-xl font-medium transition-all active:scale-95"
              title="ล้างตัวกรองทั้งหมด"
            >
              <FilterX size={20} />
              ล้างการค้นหา
            </button>
            {canCreate && (
              <button 
                onClick={() => { setEditingBriefing(null); setIsModalOpen(true); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-95"
              >
                <Plus size={20} />
                สร้างบรีฟใหม่
              </button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="flex flex-col gap-4">
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <StatCard label="ทั้งหมด" value={stats.total} color="bg-slate-800" icon={<NotebookTabs size={16}/>} onClick={() => { setFilterStatus('All'); setFilterPostStatus('All'); }} active={filterStatus === 'All' && filterPostStatus === 'All'} />
              <StatCard label="รอดำเนินการ" value={stats.byStatus['รอดำเนินการ'] || 0} color="bg-slate-500" icon={<Clock size={16}/>} onClick={() => setFilterStatus('รอดำเนินการ')} active={filterStatus === 'รอดำเนินการ'} />
              <StatCard label="กำลังทำ" value={stats.byStatus['กำลังทำ'] || 0} color="bg-blue-600" icon={<RefreshCw size={16}/>} onClick={() => setFilterStatus('กำลังทำ')} active={filterStatus === 'กำลังทำ'} />
              <StatCard label="รอตรวจ" value={stats.byStatus['รอตรวจ'] || 0} color="bg-[#f472b6]" icon={<PieChart size={16}/>} onClick={() => setFilterStatus('รอตรวจ')} active={filterStatus === 'รอตรวจ'} />
              <StatCard label="รอแก้ไข" value={stats.byStatus['รอแก้ไข'] || 0} color="bg-yellow-400 text-yellow-950" icon={<AlertCircle size={16}/>} onClick={() => setFilterStatus('รอแก้ไข')} active={filterStatus === 'รอแก้ไข'} />
              <StatCard label="เสร็จสิ้น" value={stats.byStatus['เสร็จสิ้น'] || 0} color="bg-[#198754]" icon={<CheckCircle2 size={16}/>} onClick={() => setFilterStatus('เสร็จสิ้น')} active={filterStatus === 'เสร็จสิ้น'} />
              <StatCard label="เกินกำหนด" value={stats.overdue} color="bg-rose-600" icon={<AlertCircle size={16}/>} onClick={() => setFilterStatus('Overdue')} active={filterStatus === 'Overdue'} />
            </div>
          </div>
          
          <hr className="border-t border-slate-200 border-dashed" />
          
          <div>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">สถานะการโพสต์</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <StatCard label="ทั้งหมด" value={stats.total} color="bg-slate-800" icon={<NotebookTabs size={16}/>} onClick={() => { setFilterPostStatus('All'); setFilterStatus('All'); }} active={filterPostStatus === 'All' && filterStatus === 'All'} />
              <StatCard label="ยังไม่โพส" value={stats.byPostStatus['ยังไม่โพส'] || 0} color="bg-slate-600" icon={<Clock size={16}/>} onClick={() => setFilterPostStatus('ยังไม่โพส')} active={filterPostStatus === 'ยังไม่โพส'} />
              <StatCard label="โพสแล้ว" value={stats.byPostStatus['โพสแล้ว'] || 0} color="bg-green-600" icon={<CheckCircle2 size={16}/>} onClick={() => setFilterPostStatus('โพสแล้ว')} active={filterPostStatus === 'โพสแล้ว'} />
            </div>
          </div>
        </div>
      </div>

      {/* Filters Area */}
      <div className="relative z-40 ios-filter-glass px-6 py-3.5 rounded-2xl space-y-4 shadow-md">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative group w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
            <input 
              type="text"
              placeholder="ค้นหาเลขบรีฟ หรือรายละเอียด..."
              className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 transition-all font-semibold text-sm text-slate-900"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full lg:w-36">
            <CustomSelect 
              value={filterDepartment} 
              borderDashed
              onChange={setFilterDepartment}
              options={['All', ...new Set(allUsers.map(u => u.Department).filter(Boolean))].map(d => ({ label: d === 'All' ? 'ทุกแผนก' : d, value: d }))}
            />
          </div>
          <div className="w-full lg:w-44">
            <CustomSelect 
              className="w-full"
              value={filterUser} 
              borderDashed
              onChange={setFilterUser}
              options={(() => {
                let availableUsers = allUsers.filter(u => u.Role !== 'Admin');
                if (user?.Role === 'Head') {
                  availableUsers = availableUsers.filter(u => u.Department === user.Department);
                }
                return ['All', ...availableUsers].map(u => ({ label: u === 'All' ? 'ทุกคน' : u.Name, value: u === 'All' ? 'All' : u.ID }));
              })()}
              searchable={true}
            />
          </div>
          <div className="w-full lg:w-[370px] flex gap-2 text-black">
            <CustomDatePicker value={startDate} onChange={setStartDate} placeholder="ตั้งแต่" borderDashed />
            <CustomDatePicker value={endDate} onChange={setEndDate} placeholder="ถึง" borderDashed />
          </div>
        </div>
      </div>

      {/* Content Area */}
      {viewMode === 'list' ? (
        <div className="relative z-10 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {currentBriefings.map(b => (
              <BriefingCard 
                key={b.ID} 
                briefing={b} 
                allUsers={allUsers}
                user={user}
                onClick={() => { 
                  if (user?.ID) localStorage.setItem(`lastViewedBriefing_${user.ID}_${b.ID}`, new Date().toISOString());
                  setEditingBriefing(b); 
                  setIsModalOpen(true); 
                }}
                onDelete={(e) => { e.stopPropagation(); setDeleteConfirmId(b.ID); }}
                onPostStatusToggle={() => handlePostStatusToggle(b)}
                statusColor={statusColors[apiService.isBriefingOverdue(b) ? 'Overdue' : b.Status]}
                priorityColor={priorityColors[b.Priority]}
                StatusDropdown={StatusDropdown}
                openStatusId={openStatusId}
                setOpenStatusId={setOpenStatusId}
              />
            ))}
            {filteredBriefings.length === 0 && (
              <div className="col-span-full py-20 bg-white/50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
                <NotebookTabs size={48} className="mb-4 opacity-20" />
                <p className="text-lg font-medium">ไม่พบข้อมูลบรีฟงาน</p>
                <p className="text-sm">ลองปรับเปลี่ยนตัวกรองหรือสร้างบรีฟใหม่</p>
              </div>
            )}
          </div>
          <PaginationSection />
        </div>
      ) : viewMode === 'table' ? (
        <div className="relative z-10 space-y-6">
           <div className="glass overflow-hidden rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/30 transition-all animate-in fade-in duration-500">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-200/60 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-16 text-center">ลำดับ</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">เลขบรีฟ / หัวข้องาน</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center w-20">ผู้มอบหมาย</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center w-24">คนรับผิดชอบ</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center w-28">กำหนดส่ง</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center w-36">สถานะงาน</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center w-24">โพสต์</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right pr-6 w-24">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {currentBriefings.map((b, index) => {
                      const rowNumber = filteredBriefings.length - ((currentPage - 1) * itemsPerPage) - index;
                      const creator = allUsers.find(u => String(u.ID) === String(b.CreatorID));
                      const isOverdue = apiService.isBriefingOverdue(b);
                      const pStatus = b.PostStatus || 'ยังไม่โพส';
                      const canManagePostStatus = isAdmin || perms.canManagePostStatus;
                      
                      const rowStyle = b.CardColor ? { borderLeft: `4px solid ${b.CardColor}` } : {};

                      return (
                        <tr 
                          key={b.ID} 
                          style={rowStyle}
                          onClick={() => { 
                            if (user?.ID) localStorage.setItem(`lastViewedBriefing_${user.ID}_${b.ID}`, new Date().toISOString());
                            setEditingBriefing(b); 
                            setIsModalOpen(true); 
                          }}
                          className="hover:bg-blue-50/20 transition-colors group cursor-pointer border-b border-slate-100 last:border-0"
                        >
                          <td className="px-4 py-3 text-center">
                            <span className="text-[11px] font-bold text-slate-400">{rowNumber}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 uppercase">
                                    {b.RunningID}
                                  </span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${priorityColors[b.Priority]}`}>
                                    {b.Priority === 'High' ? 'สูง' : b.Priority === 'Medium' ? 'กลาง' : b.Priority === 'Low' ? 'ต่ำ' : b.Priority}
                                  </span>
                                </div>
                                <h4 className="text-xs font-bold text-slate-800 line-clamp-1">{b.Title || b.Detail}</h4>
                                {b.Title && <p className="text-[10px] text-slate-400 line-clamp-1">{b.Detail}</p>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                             <div className="flex justify-center">
                               {creator?.ProfileImage ? (
                                 <img src={creator.ProfileImage} alt="" className="w-7 h-7 rounded-full border border-slate-200" title={creator.Name} />
                               ) : (
                                 <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500" title={creator?.Name}>
                                   {(creator?.Name || 'U').charAt(0)}
                                 </div>
                               )}
                             </div>
                          </td>
                          <td className="px-4 py-3">
                              <div className="flex justify-center -space-x-2 overflow-hidden">
                                 {b.Assignees?.slice(0, 3).map((assigneeId, i) => {
                                   const assignee = allUsers.find(u => String(u.ID) === String(assigneeId));
                                   if (!assignee) return null;
                                   return assignee.ProfileImage ? (
                                     <img key={i} src={assignee.ProfileImage} alt="" className="w-7 h-7 rounded-full border-2 border-white object-cover bg-white" title={assignee.Name} />
                                   ) : (
                                     <div key={i} className="w-7 h-7 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[10px] text-blue-600 font-bold" title={assignee.Name}>
                                       {assignee.Name?.charAt(0) || 'U'}
                                     </div>
                                   );
                                 })}
                                 {b.Assignees?.length > 3 && (
                                   <div className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[8px] text-slate-500 font-bold z-10">+{b.Assignees.length - 3}</div>
                                 )}
                              </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                             <div className="flex flex-col items-center">
                                <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                                   <Calendar size={12} className={isOverdue ? 'text-red-500' : 'text-blue-500'} />
                                   {b.DueDate ? format(new Date(b.DueDate), 'dd/MM/yyyy', { locale: th }) : 'ไม่มีกำหนดส่ง'}
                                </div>
                             </div>
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                             <div className="flex justify-center scale-90 origin-center">
                               <StatusDropdown 
                                  briefing={b} 
                                  currentStatus={b.Status} 
                                  isOpen={openStatusId === b.ID}
                                  onToggle={setOpenStatusId}
                                />
                             </div>
                          </td>
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                             <div className="flex justify-center">
                                {canManagePostStatus ? (
                                   <button 
                                     onClick={(e) => { e.stopPropagation(); handlePostStatusToggle(b); }}
                                     className={`px-2 py-0.5 text-[9px] font-bold rounded-full border transition-all ${pStatus === 'โพสแล้ว' ? 'bg-green-600 border-green-600 text-white' : 'bg-slate-600 border-slate-600 text-white'}`}
                                   >
                                     {pStatus}
                                   </button>
                                ) : (
                                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${pStatus === 'โพสแล้ว' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>
                                    {pStatus}
                                  </span>
                                )}
                             </div>
                          </td>
                          <td className="px-4 py-3 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                             <div className="flex justify-end gap-1.5">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setEditingBriefing(b); setIsModalOpen(true); }}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                                  title="แก้ไข"
                                >
                                  <Edit2 size={14} />
                                </button>
                                {(isAdmin || String(b.CreatorID) === String(user?.ID) || (user?.Role === 'Head' && creator?.Department === user?.Department)) && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(b.ID); }}
                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                                    title="ลบ"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                             </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-slate-50/30 p-4 border-t border-slate-100">
                <PaginationSection />
              </div>
           </div>
        </div>
      ) : (
        <div className="glass p-6 rounded-3xl border border-slate-200/60 shadow-sm animate-in zoom-in-95 duration-300 min-h-[500px]">
          <BriefingTimeline 
            briefings={filteredBriefings} 
            onBriefingClick={(b) => { setEditingBriefing(b); setIsModalOpen(true); }}
          />
        </div>
      )}

      {isSettingsOpen && (
        <BriefingSettingsModal 
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={uiSettings}
          onSave={setUiSettings}
        />
      )}

      {isModalOpen && (
        <BriefingModal 
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setEditingBriefing(null); }}
          onSaved={() => { setIsModalOpen(false); setEditingBriefing(null); fetchData(); }}
          briefing={editingBriefing}
          allUsers={allUsers}
        />
      )}

      <ConfirmModal 
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
        title="ลบบรีฟงาน?"
        message="คุณแน่ใจว่าต้องการลบบรีฟงานนี้หรือไม่? ข้อมูลจะถูกลบออกจากระบบอย่างถาวร"
        closeOnOutsideClick={false}
        confirmText="ลบข้อมูล"
        confirmColor="bg-red-600 hover:bg-red-700"
      />
    </div>
  );
};

const StatCard = ({ label, value, color, icon, onClick, active }) => (
  <button 
    onClick={onClick}
    className={`p-4 rounded-2xl flex flex-col gap-2 transition-all hover:scale-105 active:scale-95 text-left border ${active ? 'bg-white shadow-md border-slate-200 ring-2 ring-offset-2 ring-blue-500/20' : 'bg-white/40 border-transparent hover:bg-white hover:border-slate-200'}`}
  >
    <div className={`w-8 h-8 rounded-lg ${color} text-white flex items-center justify-center shadow-sm`}>
      {icon}
    </div>
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  </button>
);

// eslint-disable-next-line react/display-name
const BriefingCard = React.memo(({ briefing, allUsers, onClick, onDelete, onPostStatusToggle, priorityColor, user, StatusDropdown, openStatusId, setOpenStatusId }) => {
  const creator = allUsers.find(u => String(u.ID) === String(briefing.CreatorID));
  const assigneesCount = briefing.Assignees?.length || 0;
  const isOverdue = apiService.isBriefingOverdue(briefing);

  const lastViewed = user ? localStorage.getItem(`lastViewedBriefing_${user.ID}_${briefing.ID}`) : null;
  const updatedAt = briefing.UpdatedAt || briefing.CreatedAt;
  // It's unread if hasn't been viewed OR updated after last view AND the current user didn't make the last update.
  const isUnread = updatedAt && (!lastViewed || new Date(updatedAt) > new Date(lastViewed)) && String(briefing.LastUpdatedBy) !== String(user?.ID);

  const cardStyle = briefing.CardColor ? {
    backgroundColor: `${briefing.CardColor}1A`, // Subtle 10% opacity background (was 3%)
    borderLeft: `8px solid ${briefing.CardColor}`,
    borderColor: `${briefing.CardColor}4D` // 30% opacity border (was 25%)
  } : {};

  return (
    <div 
      onClick={onClick}
      style={cardStyle}
      className={`group relative bg-white p-5 rounded-2xl border-2 border-dashed shadow-md transition-all cursor-pointer flex flex-col gap-4 mb-1 ${
        openStatusId === briefing.ID ? 'z-50 shadow-2xl border-blue-400 overflow-visible' : 'z-0 border-slate-300 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-500/10 overflow-hidden'
      }`}
    >
      {isOverdue && (
        <div className="absolute top-0 right-0 z-10">
          <div className="bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-tighter">ล่าช้า (LATE)</div>
        </div>
      )}
      
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 uppercase tracking-wider">
              {briefing.RunningID}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${priorityColor}`}>
              {briefing.Priority === 'High' ? 'สูง' : briefing.Priority === 'Medium' ? 'กลาง' : briefing.Priority === 'Low' ? 'ต่ำ' : briefing.Priority}
            </span>
            {isUnread && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md text-white bg-pink-500 uppercase tracking-widest animate-pulse shadow-sm shadow-pink-200">
                <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                อัปเดต
              </span>
            )}
          </div>
          <h3 className="font-bold text-slate-900 line-clamp-2 leading-snug group-hover:text-blue-600 transition-colors mt-2" title={briefing.Title || briefing.Detail}>
            {briefing.Title || briefing.Detail}
          </h3>
          {briefing.Title && (
            <p className="text-xs text-slate-500 line-clamp-1 mt-1">{briefing.Detail}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 mt-auto">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusDropdown 
              briefing={briefing} 
              currentStatus={briefing.Status} 
              isOpen={openStatusId === briefing.ID}
              onToggle={setOpenStatusId}
            />
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg">
              <Calendar size={13} />
              {briefing.DueDate ? format(new Date(briefing.DueDate), 'd MMM yy', { locale: th }) : 'ไม่มีกำหนดส่ง'}
            </div>
          </div>
  
          {/* Sync Indicators - Small & discrete for briefings */}
          {briefing.syncState === 'syncing' && (
            <div className="flex items-center gap-1 text-[9px] font-bold text-blue-600 animate-pulse">
              <RefreshCw size={10} className="animate-spin" /> คลังข้อมูล...
            </div>
          )}
          {briefing.syncState === 'success' && (
            <div className="flex items-center gap-1 text-[9px] font-bold text-green-600">
              <CheckCircle2 size={10} /> เรียบร้อย
            </div>
          )}
        </div>
        
        <hr className="border-t border-slate-100 border-dashed" />
        
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">สถานะโพส:</span>
            {(() => {
              const isAdmin = user?.Role === 'Admin';
              const perms = user?.Permissions || {};
              const canManagePostStatus = isAdmin || perms.canManagePostStatus;
              const pStatus = briefing.PostStatus || 'ยังไม่โพส';
              
              if (canManagePostStatus) {
                return (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onPostStatusToggle();
                    }}
                    className={`px-3 py-1 text-[10px] font-bold rounded-full border shadow-sm transition-all hover:scale-105 active:scale-95 ${pStatus === 'โพสแล้ว' ? 'bg-green-600 border-green-600 text-white' : 'bg-slate-600 border-slate-600 text-white'}`}
                  >
                    {pStatus}
                  </button>
                );
              } else {
                return (
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${pStatus === 'โพสแล้ว' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>
                    {pStatus}
                  </span>
                );
              }
            })()}
            {briefing.PostDate && briefing.PostStatus === 'โพสแล้ว' && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Calendar size={10} />
                {format(new Date(briefing.PostDate), 'd MMM', { locale: th })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-1">
        <div className="flex items-center gap-2">
          {creator?.ProfileImage ? (
            <img src={creator.ProfileImage} alt="" className="w-6 h-6 rounded-full border border-slate-200" title={`สร้างโดย ${creator.Name}`} />
          ) : (
            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500" title={`สร้างโดย ${creator?.Name || 'Unknown'}`}>
              {(creator?.Name || 'U').charAt(0)}
            </div>
          )}
          <span className="text-xs text-slate-500 font-medium truncate max-w-[80px]">
            {creator?.Name?.split(' ')[0]}
          </span>
        </div>
        
        <div className="flex -space-x-2">
           {assigneesCount > 0 && briefing.Assignees.slice(0, 3).map((assigneeId, i) => {
             const assignee = allUsers.find(u => String(u.ID) === String(assigneeId));
             if (!assignee) return null;
             return assignee.ProfileImage ? (
               <img key={i} src={assignee.ProfileImage} alt="" className="w-6 h-6 rounded-full border-2 border-white object-cover bg-white" title={assignee.Name} />
             ) : (
               <div key={i} className="w-6 h-6 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[10px] text-blue-600 font-bold" title={assignee.Name}>
                 {assignee.Name?.charAt(0) || 'U'}
               </div>
             );
           })}
           {assigneesCount > 3 && (
             <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[8px] text-slate-500 font-bold z-10">+{assigneesCount - 3}</div>
           )}
        </div>
      </div>
      
      {(user?.Role === 'Admin' || String(briefing.CreatorID) === String(user?.ID) || (user?.Role === 'Head' && allUsers.find(u => String(u.ID) === String(briefing.CreatorID))?.Department === user?.Department)) && (
        <button 
          onClick={onDelete}
          className="absolute top-3 right-3 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all border border-slate-100 bg-white/80 backdrop-blur-sm shadow-sm z-20"
          title="ลบบรีฟงาน"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.briefing.ID === next.briefing.ID &&
    prev.briefing.Status === next.briefing.Status &&
    prev.briefing.PostStatus === next.briefing.PostStatus &&
    prev.briefing.PostDate === next.briefing.PostDate &&
    prev.briefing.syncState === next.briefing.syncState &&
    prev.briefing.UpdatedAt === next.briefing.UpdatedAt &&
    prev.openStatusId === next.openStatusId &&
    prev.user?.ID === next.user?.ID &&
    prev.allUsers.length === next.allUsers.length
  );
});

// --- Settings Modal Component ---
const BriefingSettingsModal = ({ isOpen, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState(settings);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
              <Settings size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">ตั้งค่าการแสดงผล</h3>
              <p className="text-xs text-slate-500">ปรับแต่งมุมมองบรีฟของคุณ</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-xl transition-colors border border-transparent hover:border-slate-200 shadow-sm">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Default View Selection */}
          <div className="space-y-4">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              มุมมองเริ่มต้นตอนเปิดหน้า
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setLocalSettings(prev => ({ ...prev, defaultView: 'list' }))}
                className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${localSettings.defaultView === 'list' ? 'border-blue-600 bg-blue-50/50 ring-4 ring-blue-500/10' : 'border-slate-100 hover:border-slate-200 bg-slate-50/30'}`}
              >
                <LayoutGrid size={24} className={localSettings.defaultView === 'list' ? 'text-blue-600' : 'text-slate-400'} />
                <span className={`text-xs font-bold ${localSettings.defaultView === 'list' ? 'text-blue-700' : 'text-slate-500'}`}>Card (การ์ด)</span>
              </button>
              <button 
                onClick={() => setLocalSettings(prev => ({ ...prev, defaultView: 'table' }))}
                className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${localSettings.defaultView === 'table' ? 'border-blue-600 bg-blue-50/50 ring-4 ring-blue-500/10' : 'border-slate-100 hover:border-slate-200 bg-slate-50/30'}`}
              >
                <List size={24} className={localSettings.defaultView === 'table' ? 'text-blue-600' : 'text-slate-400'} />
                <span className={`text-xs font-bold ${localSettings.defaultView === 'table' ? 'text-blue-700' : 'text-slate-500'}`}>Table (ตาราง)</span>
              </button>
            </div>
          </div>

          {/* Items Per Page */}
          <div className="space-y-4">
            <label className="text-sm font-bold text-slate-700">จำนวนรายการต่อหน้า</label>
            <div className="grid grid-cols-3 gap-2">
              {[10, 20, 30, 40, 50, 100].map(num => (
                <button
                  key={num}
                  onClick={() => setLocalSettings(prev => ({ ...prev, itemsPerPage: num }))}
                  className={`py-2 px-3 rounded-xl border-2 text-xs font-bold transition-all ${localSettings.itemsPerPage === num ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 hover:border-slate-200 bg-slate-50 text-slate-500'}`}
                >
                  {num} รายการ
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border-2 border-slate-200 font-bold text-slate-600 hover:bg-white transition-all">
            ยกเลิก
          </button>
          <button 
            onClick={() => {
              onSave(localSettings);
              onClose();
            }}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
          >
            บันทึกการตั้งค่า
          </button>
        </div>
      </div>
    </div>
  );
};
