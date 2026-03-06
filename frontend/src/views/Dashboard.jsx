import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AlertCircle, Activity, CheckCircle2, Clock, AlertTriangle, PlayCircle, ClipboardList, X } from 'lucide-react';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LoadingModal } from '../components/LoadingModal';
import { StatusTasksModal } from '../components/StatusTasksModal';
import { CustomSelect } from '../components/CustomSelect';

export const Dashboard = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [filterUser, setFilterUser] = useState('All');
  const [filterYear, setFilterYear] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [overduePage, setOverduePage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  const userRole = user?.Role || user?.role;
  const userName = user?.Name || user?.name;
  const userDept = user?.Department || user?.department;

  const isAdmin = userRole === 'Admin';
  const isHRHead = userRole === 'Head' && userDept === 'HR';
  const canSeeAll = isAdmin || isHRHead;
  
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      try {
        const data = await apiService.getTasksSummary();
        if (isMounted) setTasks(data);
        
        if (canSeeAll || userRole === 'Head') {
          const usersData = await apiService.getUsers();
          if (isMounted) setAllUsers(usersData);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchData();
    return () => { isMounted = false; };
  }, [user, canSeeAll, userRole]);



  const uniqueDepartments = [...new Set(allUsers.map(u => u.Department))].filter(Boolean);
  const uniqueUsers = [...new Set(allUsers.filter(u => {
    if (userRole === 'Head' && !canSeeAll && u.Department !== userDept) return false;
    return filterDepartment === 'All' || u.Department === filterDepartment;
  }).map(u => u.Name))].filter(Boolean);
  const uniqueYears = [...new Set(tasks.map(t => new Date(t.StartDate).getFullYear()))].filter(Boolean).sort((a,b) => b - a);

  const filteredTasks = tasks.filter(t => {
    if (!canSeeAll) {
      if (userRole === 'Staff' && t.StaffName !== userName) return false;
      if (userRole === 'Head') {
        if (t.Department !== userDept) return false;
        if (filterUser !== 'All' && t.StaffName !== filterUser) return false;
      }
    } else {
      if (filterDepartment !== 'All' && t.Department !== filterDepartment) return false;
      if (filterUser !== 'All' && t.StaffName !== filterUser) return false;
    }
    if (filterYear !== 'All' && new Date(t.StartDate).getFullYear().toString() !== filterYear.toString()) return false;
    if (startDate && new Date(t.StartDate) < new Date(startDate)) return false;
    if (endDate && new Date(t.StartDate) > new Date(endDate)) return false;
    return true;
  });

  // Calculate stats
  const overdueTasks = filteredTasks.filter(t => new Date(t.DueDate) < new Date() && t.Status !== 'เสร็จสิ้น');
  const doneTasks = filteredTasks.filter(t => t.Status === 'เสร็จสิ้น');

  // Prepare heatmap data
  const workload = filteredTasks.reduce((acc, task) => {
    if (!acc[task.StaffName]) acc[task.StaffName] = 0;
    acc[task.StaffName]++;
    return acc;
  }, {});
  
  const heatmapData = Object.keys(workload).map(name => ({
    name,
    tasks: workload[name]
  })).sort((a, b) => b.tasks - a.tasks);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <LoadingModal isOpen={loading} message="กำลังโหลดข้อมูล..." />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">แผงควบคุม</h2>
          <p className="text-slate-500">ยินดีต้อนรับกลับมา, {user?.Name || user?.name || 'User'}</p>
        </div>
        
        <div className="flex flex-col gap-3 bg-white/50 p-3 rounded-xl border border-slate-200/60">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-500 hidden sm:block">ปี:</span>
            <CustomSelect
              value={filterYear}
              onChange={(val) => {
                setFilterYear(val);
                setStartDate('');
                setEndDate('');
              }}
              options={['All', ...uniqueYears].map(y => ({ label: y === 'All' ? 'ทุกปี' : y, value: y }))}
              className="w-full sm:w-28"
            />
            <div className="w-px h-6 bg-slate-300 mx-1 hidden sm:block"></div>
            <span className="text-sm font-medium text-slate-500 hidden sm:block">ตั้งแต่วันที่:</span>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setFilterYear('All'); }}
              className="w-full sm:w-32 px-2 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none"
            />
            <span className="text-sm font-medium text-slate-500 hidden sm:block">ถึง:</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setFilterYear('All'); }}
              className="w-full sm:w-32 px-2 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none"
            />
            
            {(canSeeAll || userRole === 'Head') && canSeeAll && (
              <>
                <div className="w-px h-6 bg-slate-300 mx-1 hidden sm:block"></div>
                <span className="text-sm font-medium text-slate-500 hidden sm:block">ตัวกรองแผนก:</span>
                <CustomSelect
                  value={filterDepartment}
                  onChange={(val) => { setFilterDepartment(val); setFilterUser('All'); }}
                  options={['All', ...uniqueDepartments].map(d => ({ label: d === 'All' ? 'ทุกแผนก' : d, value: d }))}
                  className="w-36"
                />
              </>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {(canSeeAll || userRole === 'Head') && (
              <>
                <span className="text-sm font-medium text-slate-500 hidden sm:block">ตัวกรองพนักงาน:</span>
                <CustomSelect
                  value={filterUser}
                  onChange={(val) => setFilterUser(val)}
                  options={['All', ...uniqueUsers].map(u => ({ label: u === 'All' ? 'พนง.ทั้งหมด' : u, value: u }))}
                  className="w-40"
                />
              </>
            )}

            {(filterYear !== 'All' || startDate || endDate || filterDepartment !== 'All' || filterUser !== 'All') && (
              <button
                onClick={() => {
                  setFilterYear('All');
                  setStartDate('');
                  setEndDate('');
                  setFilterDepartment('All');
                  setFilterUser('All');
                }}
                className="flex items-center gap-1 px-3 py-2 ml-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
                title="ล้างตัวกรอง"
              >
                <X size={14} />
                <span className="hidden sm:inline">ล้างตัวกรองทั้งหมด</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={() => { setSelectedStatus('ทั้งหมด'); setIsStatusModalOpen(true); }}
          className="glass p-6 rounded-2xl flex items-center gap-4 cursor-pointer hover:shadow-md transition-all border border-transparent hover:border-blue-200"
        >
          <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">งานทั้งหมด</p>
            <p className="text-2xl font-bold text-slate-900">{filteredTasks.length}</p>
          </div>
        </div>

        <div 
          onClick={() => { setSelectedStatus('ยังไม่เริ่ม'); setIsStatusModalOpen(true); }}
          className="glass p-6 rounded-2xl flex items-center gap-4 border-l-4 border-slate-300 cursor-pointer hover:shadow-md transition-all border-y border-r border-transparent hover:border-slate-200"
        >
          <div className="p-3 bg-slate-100 text-slate-600 rounded-xl">
            <PlayCircle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">ยังไม่เริ่ม</p>
            <p className="text-2xl font-bold text-slate-900">
              {filteredTasks.filter(t => t.Status === 'ยังไม่เริ่ม').length}
            </p>
          </div>
        </div>

        <div 
          onClick={() => { setSelectedStatus('รอแก้ไข'); setIsStatusModalOpen(true); }}
          className="glass p-6 rounded-2xl flex items-center gap-4 border-l-4 border-amber-400 cursor-pointer hover:shadow-md transition-all border-y border-r border-transparent hover:border-amber-200"
        >
          <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">รอแก้ไข</p>
            <p className="text-2xl font-bold text-amber-600">
              {filteredTasks.filter(t => t.Status === 'รอแก้ไข').length}
            </p>
          </div>
        </div>

        <div 
          onClick={() => { setSelectedStatus('รอตรวจ'); setIsStatusModalOpen(true); }}
          className="glass p-6 rounded-2xl flex items-center gap-4 border-l-4 border-purple-400 cursor-pointer hover:shadow-md transition-all border-y border-r border-transparent hover:border-purple-200"
        >
          <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
            <ClipboardList size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">รอตรวจ</p>
            <p className="text-2xl font-bold text-purple-600">
              {filteredTasks.filter(t => t.Status === 'รอตรวจ').length}
            </p>
          </div>
        </div>
        
        <div 
          onClick={() => { setSelectedStatus('เกินกำหนด'); setIsStatusModalOpen(true); }}
          className="glass p-6 rounded-2xl flex items-center gap-4 border-l-4 border-red-400 cursor-pointer hover:shadow-md transition-all border-y border-r border-transparent hover:border-red-200"
        >
          <div className="p-3 bg-red-100 text-red-600 rounded-xl">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">เกินกำหนด</p>
            <p className="text-2xl font-bold text-red-600">{overdueTasks.length}</p>
          </div>
        </div>

        <div 
          onClick={() => { setSelectedStatus('เสร็จสิ้น'); setIsStatusModalOpen(true); }}
          className="glass p-6 rounded-2xl flex items-center gap-4 border-l-4 border-green-500 cursor-pointer hover:shadow-md transition-all border-y border-r border-transparent hover:border-green-200"
        >
          <div className="p-3 bg-green-100 text-green-600 rounded-xl">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">เสร็จสิ้น</p>
            <p className="text-2xl font-bold text-slate-900">{doneTasks.length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Workload Heatmap */}
        <div className="glass p-6 rounded-2xl shadow-sm border border-slate-200/60">
          <h3 className="text-lg font-bold text-slate-900 mb-6">ความหนาแน่นของงานแต่ละบุคคล</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={heatmapData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '0.75rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Bar dataKey="tasks" radius={[4, 4, 0, 0]}>
                  {heatmapData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.tasks > 2 ? '#ef4444' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Overdue Alerts */}
        <div className="glass p-6 rounded-2xl shadow-sm border border-slate-200/60 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="text-red-500" size={20} />
              แจ้งเตือนงานเกินกำหนด
            </h3>
            {overdueTasks.length > 5 && (
              <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                 <button disabled={overduePage === 1} onClick={() => setOverduePage(p => p - 1)} className="px-2 py-1 bg-white rounded shadow-sm text-xs disabled:opacity-50 text-slate-700 font-medium transition-opacity">ก่อนหน้า</button>
                 <span className="px-2 py-1 text-xs font-medium text-slate-600">หน้า {overduePage}</span>
                 <button disabled={overduePage * 5 >= overdueTasks.length} onClick={() => setOverduePage(p => p + 1)} className="px-2 py-1 bg-white rounded shadow-sm text-xs disabled:opacity-50 text-slate-700 font-medium transition-opacity">ถัดไป</button>
              </div>
            )}
          </div>
          <div className="space-y-4 flex-1">
            {overdueTasks.length === 0 ? (
              <p className="text-slate-500 text-center py-8">เยี่ยมมาก! ไม่มีงานที่เกินกำหนด</p>
            ) : (
              overdueTasks.slice((overduePage - 1) * 5, overduePage * 5).map(task => (
                <div key={task.ID} className="p-4 rounded-xl border border-red-200 bg-red-50 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-red-900 line-clamp-1">{task.Detail}</h4>
                    <p className="text-xs text-red-700 bg-red-100/50 w-fit px-1.5 py-0.5 rounded mt-0.5">ID: #{String(task.ID).slice(-4)} | {task.StaffName}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      ล่าช้า
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <StatusTasksModal 
        key={selectedStatus || 'none'}
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        status={selectedStatus}
        userRole={userRole}
        tasks={
          selectedStatus === 'ทั้งหมด' ? filteredTasks : 
          selectedStatus === 'เกินกำหนด' ? overdueTasks :
          selectedStatus === 'เสร็จสิ้น' ? doneTasks :
          filteredTasks.filter(t => t.Status === selectedStatus)
        }
      />
    </div>
  );
};
