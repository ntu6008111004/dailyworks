import React, { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { AlertCircle, Activity, CheckCircle2, Clock, AlertTriangle, PlayCircle, ClipboardList, X } from 'lucide-react';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LoadingModal } from '../components/LoadingModal';
import { StatusTasksModal } from '../components/StatusTasksModal';
import { CustomSelect } from '../components/CustomSelect';
import { CustomDatePicker } from '../components/CustomDatePicker';

export const Dashboard = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [filterUser, setFilterUser] = useState('All');
  const [filterYear, setFilterYear] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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

    const handleSync = async () => {
      try {
        const data = await apiService.getTasksSummary();
        if (isMounted) setTasks(data);
      } catch (err) {
        console.error('Sync error:', err);
      }
    };

    window.addEventListener('tasks-optimistic-update', handleSync);
    window.addEventListener('cache-cleared', handleSync);

    return () => { 
      isMounted = false; 
      window.removeEventListener('tasks-optimistic-update', handleSync);
      window.removeEventListener('cache-cleared', handleSync);
    };
  }, [user, canSeeAll, userRole]);

  const uniqueDepartments = useMemo(() => {
    return [...new Set(allUsers.map(u => u.Department))].filter(Boolean);
  }, [allUsers]);

  const uniqueUsers = useMemo(() => {
    return [...new Set(allUsers.filter(u => {
      if (u.Role === 'Admin') return false;
      if (userRole === 'Head' && !canSeeAll && u.Department !== userDept) return false;
      return filterDepartment === 'All' || u.Department === filterDepartment;
    }).map(u => u.Name))].filter(Boolean);
  }, [allUsers, userRole, canSeeAll, userDept, filterDepartment]);

  const uniqueYears = useMemo(() => {
    return [...new Set(tasks.map(t => new Date(t.StartDate).getFullYear()))].filter(Boolean).sort((a,b) => b - a);
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
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
  }, [tasks, canSeeAll, userRole, userName, userDept, filterUser, filterDepartment, filterYear, startDate, endDate]);

  const { doneTasks, statusChartData } = useMemo(() => {
    const done = filteredTasks.filter(t => t.Status === 'เสร็จสิ้น');
    
    // Group by status for the chart
    const statusCounts = filteredTasks.reduce((acc, task) => {
      const status = task.Status || 'ไม่ระบุ';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const statusData = [
      { name: 'ยังไม่เริ่ม', value: statusCounts['ยังไม่เริ่ม'] || 0, color: '#94a3b8' },
      { name: 'รอแก้ไข', value: statusCounts['รอแก้ไข'] || 0, color: '#fbbf24' },
      { name: 'รอตรวจ', value: statusCounts['รอตรวจ'] || 0, color: '#c084fc' },
      { name: 'เสร็จสิ้น', value: statusCounts['เสร็จสิ้น'] || 0, color: '#22c55e' }
    ].filter(s => s.value > 0);

    return { doneTasks: done, statusChartData: statusData };
  }, [filteredTasks]);

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
            <CustomDatePicker 
              selectedDate={startDate}
              onChange={(date) => { setStartDate(date); setFilterYear('All'); }}
              className="sm:w-36"
            />
            <span className="text-sm font-medium text-slate-500 hidden sm:block">ถึง:</span>
            <CustomDatePicker 
              selectedDate={endDate}
              onChange={(date) => { setEndDate(date); setFilterYear('All'); }}
              className="sm:w-36"
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
          onClick={() => { setSelectedStatus('เสร็จสิ้น'); setIsStatusModalOpen(true); }}
          className="glass p-6 rounded-2xl flex items-center gap-4 border-l-4 border-green-500 cursor-pointer hover:shadow-md transition-all border-y border-r border-transparent hover:border-green-200 lg:col-span-2"
        >
          <div className="p-3 bg-green-100 text-green-600 rounded-xl">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">เสร็จสิ้น</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-slate-900">{doneTasks.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="glass p-6 rounded-3xl border border-slate-200/60 shadow-sm animate-in fade-in zoom-in-95 duration-500">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-slate-800">สัดส่วนงานแยกตามสถานะ</h3>
            <p className="text-sm text-slate-500">แสดงปริมาณงานทั้งหมดแยกตามสถานะการดำเนินงานปัจจุบัน</p>
          </div>
        </div>
        
        <div className="h-[400px] w-full">
          {statusChartData && statusChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={140}
                  innerRadius={90}
                  paddingAngle={8}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {statusChartData.map((entry, index) => (
                    <Cell key={`status-cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Activity size={48} className="mb-4 opacity-20" />
              <p className="text-lg">ไม่มีข้อมูลสำหรับแสดงกราฟสรุปสถานะ</p>
            </div>
          )}
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
          selectedStatus === 'เสร็จสิ้น' ? doneTasks :
          filteredTasks.filter(t => t.Status === selectedStatus)
        }
      />
    </div>
  );
};
