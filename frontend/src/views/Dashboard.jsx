import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AlertCircle, Activity, CheckCircle2, Clock } from 'lucide-react';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LoadingModal } from '../components/LoadingModal';

export const Dashboard = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [filterUser, setFilterUser] = useState('All');

  const userRole = user?.Role || user?.role;
  const userName = user?.Name || user?.name;
  const userDept = user?.Department || user?.department;

  const isAdmin = userRole === 'Admin';
  const isHRHead = userRole === 'Head' && userDept === 'HR';
  const canSeeAll = isAdmin || isHRHead;

  useEffect(() => {
    let isMounted = true;
    apiService.getTasks()
      .then(data => {
        if (isMounted) {
          setTasks(data);
        }
      })
      .catch(err => console.error(err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });
      
    return () => { isMounted = false; };
  }, [user]);

  const uniqueDepartments = [...new Set(tasks.map(t => t.Department))].filter(Boolean);
  const uniqueUsers = [...new Set(tasks.filter(t => filterDepartment === 'All' || t.Department === filterDepartment).map(t => t.StaffName))].filter(Boolean);

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
        
        {(canSeeAll || userRole === 'Head') && (
          <div className="flex items-center gap-2 flex-wrap bg-white/50 p-2 rounded-xl border border-slate-200/60">
            <span className="text-sm font-medium text-slate-500 hidden sm:block">ตัวกรอง:</span>
            {canSeeAll && (
              <select
                value={filterDepartment}
                onChange={(e) => { setFilterDepartment(e.target.value); setFilterUser('All'); }}
                className="w-32 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none"
              >
                <option value="All">ทุกแผนก</option>
                {uniqueDepartments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            )}
            
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="w-36 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none"
            >
              <option value="All">พนง.ทั้งหมด</option>
              {uniqueUsers.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Stats Cards */}
        <div className="glass p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">งานทั้งหมด</p>
            <p className="text-2xl font-bold text-slate-900">{filteredTasks.length}</p>
          </div>
        </div>
        
        <div className="glass p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-red-100 text-red-600 rounded-xl">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">งานที่เกินกำหนด</p>
            <p className="text-2xl font-bold text-red-600">{overdueTasks.length}</p>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl flex items-center gap-4">
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
        <div className="glass p-6 rounded-2xl shadow-sm border border-slate-200/60">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Clock className="text-red-500" size={20} />
            แจ้งเตือนงานเกินกำหนดเวลา
          </h3>
          <div className="space-y-4">
            {overdueTasks.length === 0 ? (
              <p className="text-slate-500 text-center py-8">เยี่ยมมาก! ไม่มีงานที่เกินกำหนด</p>
            ) : (
              overdueTasks.map(task => (
                <div key={task.ID} className="p-4 rounded-xl border border-red-200 bg-red-50 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-red-900">งาน #{task.ID} {task.Detail}</h4>
                    <p className="text-sm text-red-700">ผู้รับผิดชอบ: {task.StaffName}</p>
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
    </div>
  );
};
