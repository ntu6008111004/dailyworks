import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, Calendar, LayoutList, PieChart, X, ChevronLeft, ChevronRight, RefreshCw, CheckCircle2, AlertCircle, Clock, NotebookTabs } from 'lucide-react';
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
  
  // UI States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBriefing, setEditingBriefing] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'timeline'

  // Filters
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [filterUser, setFilterUser] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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
  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchTerm);
    }, 1200);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filteredBriefings = useMemo(() => {
    return briefings.filter(b => {
      // 1. Accessibility Logic: Only Creator or Assignees can see (Admins see all)
      const isCreator = String(b.CreatorID) === String(user?.ID);
      const isAssignee = b.Assignees?.some(id => String(id) === String(user?.ID));
      if (!isAdmin && !isCreator && !isAssignee) return false;

      // 2. Search Query
      if (searchQuery && !b.Detail?.toLowerCase().includes(searchQuery.toLowerCase()) && !b.RunningID?.toLowerCase().includes(searchQuery.toLowerCase())) return false;

      // 3. Status
      if (filterStatus === 'Overdue') {
        if (!apiService.isBriefingOverdue(b)) return false;
      } else if (filterStatus !== 'All' && b.Status !== filterStatus) {
        return false;
      }

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

      // 6. Dates
      if (startDate && new Date(b.CreatedAt) < new Date(startDate)) return false;
      if (endDate && new Date(b.CreatedAt) > new Date(endDate)) return false;

      return true;
    }).sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt));
  }, [briefings, user, isAdmin, searchQuery, filterStatus, filterDepartment, filterUser, startDate, endDate, allUsers]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterDepartment, filterUser, startDate, endDate]);

  const totalPages = Math.ceil(filteredBriefings.length / itemsPerPage);
  const currentBriefings = filteredBriefings.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const stats = useMemo(() => {
    const total = briefings.length;
    const overdue = briefings.filter(b => apiService.isBriefingOverdue(b)).length;
    const byStatus = briefings.reduce((acc, b) => {
      acc[b.Status] = (acc[b.Status] || 0) + 1;
      return acc;
    }, {});

    return { total, overdue, byStatus };
  }, [briefings]);

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
                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
               >
                 <LayoutList size={20} />
               </button>
               <button 
                onClick={() => setViewMode('timeline')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'timeline' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
               >
                 <Calendar size={20} />
               </button>
            </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="ทั้งหมด" value={stats.total} color="bg-slate-800" icon={<NotebookTabs size={16}/>} onClick={() => setFilterStatus('All')} active={filterStatus === 'All'} />
          <StatCard label="รอดำเนินการ" value={stats.byStatus['รอดำเนินการ'] || 0} color="bg-slate-500" icon={<Clock size={16}/>} onClick={() => setFilterStatus('รอดำเนินการ')} active={filterStatus === 'รอดำเนินการ'} />
          <StatCard label="กำลังทำ" value={stats.byStatus['กำลังทำ'] || 0} color="bg-blue-600" icon={<RefreshCw size={16}/>} onClick={() => setFilterStatus('กำลังทำ')} active={filterStatus === 'กำลังทำ'} />
          <StatCard label="รอตรวจ" value={stats.byStatus['รอตรวจ'] || 0} color="bg-[#f472b6]" icon={<PieChart size={16}/>} onClick={() => setFilterStatus('รอตรวจ')} active={filterStatus === 'รอตรวจ'} />
          <StatCard label="รอแก้ไข" value={stats.byStatus['รอแก้ไข'] || 0} color="bg-yellow-400 text-yellow-950" icon={<AlertCircle size={16}/>} onClick={() => setFilterStatus('รอแก้ไข')} active={filterStatus === 'รอแก้ไข'} />
          <StatCard label="เสร็จสิ้น" value={stats.byStatus['เสร็จสิ้น'] || 0} color="bg-[#198754]" icon={<CheckCircle2 size={16}/>} onClick={() => setFilterStatus('เสร็จสิ้น')} active={filterStatus === 'เสร็จสิ้น'} />
          <StatCard label="เกินกำหนด" value={stats.overdue} color="bg-rose-600" icon={<AlertCircle size={16}/>} onClick={() => setFilterStatus('Overdue')} active={filterStatus === 'Overdue'} />
        </div>
      </div>

      {/* Filters Area */}
      <div className="relative z-40 glass p-4 rounded-2xl border border-slate-200/60 space-y-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="ค้นหาเลขบรีฟ หรือรายละเอียด..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <CustomSelect 
            value={filterDepartment} 
            onChange={setFilterDepartment}
            options={['All', ...new Set(allUsers.map(u => u.Department).filter(Boolean))].map(d => ({ label: d === 'All' ? 'ทุกแผนก' : d, value: d }))}
          />
          <CustomSelect 
            value={filterUser} 
            onChange={setFilterUser}
            options={['All', ...allUsers].map(u => ({ label: u === 'All' ? 'ทุกคน' : u.Name, value: u === 'All' ? 'All' : u.ID }))}
          />
          <div className="flex gap-2">
            <CustomDatePicker value={startDate} onChange={setStartDate} placeholder="ตั้งแต่" />
            <CustomDatePicker value={endDate} onChange={setEndDate} placeholder="ถึง" />
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
                statusColor={statusColors[apiService.isBriefingOverdue(b) ? 'Overdue' : b.Status]}
                priorityColor={priorityColors[b.Priority]}
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
          
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8 pb-4">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-all bg-white shadow-sm"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-500">หน้า</span>
                <span className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm border border-blue-100">{currentPage}</span>
                <span className="text-sm font-bold text-slate-500">จาก {totalPages}</span>
              </div>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-all bg-white shadow-sm"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="glass p-6 rounded-3xl border border-slate-200/60 shadow-sm animate-in zoom-in-95 duration-300 min-h-[500px]">
          <BriefingTimeline 
            briefings={filteredBriefings} 
            onBriefingClick={(b) => { setEditingBriefing(b); setIsModalOpen(true); }}
          />
        </div>
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

const BriefingCard = ({ briefing, allUsers, onClick, onDelete, statusColor, priorityColor, user }) => {
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
      className="group relative bg-white p-5 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-500/5 transition-all cursor-pointer flex flex-col gap-4 overflow-hidden"
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

      <div className="flex flex-wrap items-center gap-2 mt-auto">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${statusColor}`}>
          {isOverdue ? 'เกินกำหนด' : briefing.Status}
        </span>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg">
          <Calendar size={13} />
          {format(new Date(briefing.DueDate), 'd MMM yy', { locale: th })}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
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
      
      {(user?.Role === 'Admin' || String(briefing.CreatorID) === String(user?.ID)) && (
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
};
