import React, { useState, useEffect } from 'react';
import { Plus, Filter, Search, Edit2, Trash2, Calendar, LayoutList } from 'lucide-react';
import { TaskModal } from '../components/TaskModal';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { LoadingModal } from '../components/LoadingModal';
import { DailySummaryModal } from '../components/DailySummaryModal';

export const Tasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const data = await apiService.getTasks();
      // Sort tasks by latest first if assuming added sequentially or by Date
      setTasks(data.reverse());
    } catch (error) {
      console.error(error);
      toast.error('ไม่สามารถดึงข้อมูลงานได้');
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

  const filteredTasks = tasks.filter(t => {
    if (filterStatus !== 'All' && t.Status !== filterStatus) return false;
    if (searchQuery && !t.Detail.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    
    // Role based filtering
    const userRole = user?.Role || user?.role;
    const userName = user?.Name || user?.name;
    
    if (userRole === 'Staff' && t.StaffName !== userName) return false;
    if (userRole === 'Head' && t.Department !== user?.Department) return false;
    // Admin sees all
    
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
            <span>สรุปงานวันนี้</span>
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

      <div className="glass p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-end">
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
          <div className="w-full sm:w-48 relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full pl-10 pr-8 py-2 border border-slate-200 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer text-sm"
            >
              <option value="All">งานทั้งหมด</option>
              {Object.keys(statusColors).map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
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
                    {Object.entries(task.CustomFields).map(([key, value]) => (
                      <div key={key} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-blue-800">
                        <span className="font-semibold">{key}:</span> {value}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex md:flex-col gap-2 justify-end opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => { setEditingTask(task); setIsModalOpen(true); }}
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
