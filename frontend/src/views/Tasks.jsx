import React, { useState, useEffect } from 'react';
import { Plus, Filter, Search, Edit2, Trash2, Calendar, LayoutList, PieChart, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { LoadingModal } from '../components/LoadingModal';
import { DailySummaryModal } from '../components/DailySummaryModal';
import { MonthlySummaryModal } from '../components/MonthlySummaryModal';
import { CustomSelect } from '../components/CustomSelect';
import { TaskModal } from '../components/TaskModal';

export const Tasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [filterUser, setFilterUser] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isMonthlySummaryOpen, setIsMonthlySummaryOpen] = useState(false);
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const data = await apiService.getTasksSummary();
      setTasks(data.reverse());
      
      const role = user?.Role || user?.role;
      const dept = user?.Department || user?.department;
      const isAdminOrHRHead = role === 'Admin' || (role === 'Head' && dept === 'HR');
      
      if (isAdminOrHRHead || role === 'Head') {
        const usersData = await apiService.getUsers();
        setAllUsers(usersData);
      }
    } catch (error) {
      console.error(error);
      toast.error('ไม่สามารถดึงข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

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
      if (editingTask) {
        await apiService.updateTask(taskData);
        toast.success('อัปเดตงานเรียบร้อย');
      } else {
        await apiService.addTask({ 
          ...taskData, 
          StaffName: user?.Name || user?.name || 'Unknown',
          Department: user?.Department || 'Unknown' 
        });
        toast.success('เพิ่มงานเรียบร้อย');
      }
      setIsModalOpen(false);
      fetchTasks();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการบันทึก: ' + error.message);
    }
  };

  const requestDelete = (id) => {
    setDeleteConfirmId(id);
  };

  const handleDeleteTask = async () => {
    if (!deleteConfirmId) return;
    setLoading(true);
    try {
      await apiService.deleteTask(deleteConfirmId);
      toast.success('ลบงานเรียบร้อย');
      fetchTasks();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาดในการลบ: ' + error.message);
      setLoading(false);
    }
  };

  const statusColors = {
    'ยังไม่เริ่ม': 'bg-slate-100 text-slate-800 border border-slate-300',
    'กำลังทำ': 'bg-blue-100 text-blue-800 border-2 border-blue-400',
    'รอตรวจ': 'bg-purple-100 text-purple-800 border-2 border-purple-400',
    'รอแก้ไข': 'bg-amber-100 text-amber-800 border-2 border-amber-400',
    'เสร็จสิ้น': 'bg-green-100 text-green-800 border-2 border-green-500 shadow-sm font-bold',
  };

  const userRole = user?.Role || user?.role;
  const userName = user?.Name || user?.name;
  const userDept = user?.Department || user?.department;

  const isAdmin = userRole === 'Admin';
  const isHRHead = userRole === 'Head' && userDept === 'HR';
  const canSeeAll = isAdmin || isHRHead;

  const uniqueDepartments = [...new Set(allUsers.map(u => u.Department))].filter(Boolean);
  const uniqueUsers = [...new Set(allUsers.filter(u => {
    if (userRole === 'Head' && !canSeeAll && u.Department !== userDept) return false;
    return filterDepartment === 'All' || u.Department === filterDepartment;
  }).map(u => u.Name))].filter(Boolean);

  const filteredTasks = tasks.filter(t => {
    if (filterStatus !== 'All' && t.Status !== filterStatus) return false;
    if (searchQuery && !t.Detail.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    
    // RBAC logic
    if (!canSeeAll) {
      if (userRole === 'Staff' && t.StaffName !== userName) return false;
      // Head (non-HR) sees their own department
      if (userRole === 'Head') {
        if (t.Department !== userDept) return false;
        // Option to filter users within department
        if (filterUser !== 'All' && t.StaffName !== filterUser) return false;
      }
    } else {
      // Admin or HR Head can filter by everything
      if (filterDepartment !== 'All' && t.Department !== filterDepartment) return false;
      if (filterUser !== 'All' && t.StaffName !== filterUser) return false;
    }
    
    // Date Filtering
    if (startDate && new Date(t.StartDate) < new Date(startDate)) return false;
    if (endDate && new Date(t.StartDate) > new Date(endDate)) return false;
    
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
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

      <div className="glass p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-end relative z-20">
        <div className="flex-1 w-full relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="ค้นหางาน..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        
        <div className="w-full md:w-auto flex flex-col sm:flex-row gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 font-medium whitespace-nowrap">ตั้งแต่:</span>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full sm:w-36 px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 font-medium whitespace-nowrap">ถึง:</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full sm:w-36 px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
            />
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

          {(searchQuery || startDate || endDate || filterDepartment !== 'All' || filterUser !== 'All' || filterStatus !== 'All') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStartDate('');
                setEndDate('');
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

      <LoadingModal isOpen={loading} message="กำลังดึงข้อมูลงานรอบล่าสุด..." />
      
      {!loading && (
        <div className="space-y-4">
          {filteredTasks.length === 0 ? (
            <div className="glass p-12 text-center rounded-2xl">
            <LayoutList className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-2 text-sm font-semibold text-slate-900">ไม่พบข้อมูลงาน</h3>
            <p className="mt-1 text-sm text-slate-500">เริ่มจดบันทึกงานโดยการกดปุ่มเพิ่มงานใหม่</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <div key={task.ID} className="glass p-5 rounded-2xl border border-slate-200/60 hover:shadow-md transition-shadow group flex flex-col md:flex-row gap-6">
              <div className="flex-1 space-y-3">
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-bold text-slate-900">{task.Detail}</h3>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${statusColors[task.Status]}`}>
                    {task.Status}
                  </span>
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
                    {Object.entries(task.CustomFields).filter(([k]) => k !== 'Images').map(([key, value]) => (
                      <div key={key} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-blue-800">
                        <span className="font-semibold">{key}:</span> {value}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Image Indicator */}
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
            ))
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
        tasks={tasks}
        user={user}
      />

      <MonthlySummaryModal
        isOpen={isMonthlySummaryOpen}
        onClose={() => setIsMonthlySummaryOpen(false)}
        tasks={tasks}
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
