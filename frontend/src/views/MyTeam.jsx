import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Users, Activity, PlayCircle, AlertTriangle, ClipboardList, AlertCircle, CheckCircle, Filter } from 'lucide-react';
import { LoadingModal } from '../components/LoadingModal';
import { CustomSelect } from '../components/CustomSelect';

export const MyTeam = () => {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDepartment, setFilterDepartment] = useState('All');

  const userRole = user?.Role || user?.role || 'Staff';
  const userDept = user?.Department || user?.department || '';
  const isAdmin = userRole === 'Admin';

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [usersData, tasksData] = await Promise.all([
        apiService.getUsers(),
        apiService.getTasksSummary()
      ]);
      
      setAllUsers(usersData);
      setAllTasks(tasksData);
      
      // Default filter for non-admins to their own department
      if (!isAdmin) {
        setFilterDepartment(userDept);
      }
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const departments = useMemo(() => {
    const depts = new Set(allUsers.map(u => u.Department).filter(Boolean));
    return ['All', ...Array.from(depts).sort()];
  }, [allUsers]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { teamMembers, stats } = useMemo(() => {
    // 1. Filter users based on department
    let filteredUsers = allUsers;
    if (filterDepartment !== 'All') {
      filteredUsers = allUsers.filter(u => u.Department === filterDepartment);
    } else if (!isAdmin) {
      // Non-admins (Heads) only see their department
      filteredUsers = allUsers.filter(u => u.Department === userDept);
    }

    // 2. Map stats per member
    const members = filteredUsers.map(member => {
      const memberTasks = allTasks.filter(t => t.User === member.Name || t.UserId == member.ID);
      
      let pending = 0;
      let late = 0;
      
      memberTasks.forEach(t => {
        if (t.Status !== 'เสร็จสิ้น') {
          pending++;
          if (t.DueDate) {
            const dueDate = new Date(t.DueDate);
            if (dueDate < today) {
              late++;
            }
          }
        }
      });
      
      return {
        ...member,
        totalTasks: memberTasks.length,
        pendingTasks: pending,
        lateTasks: late
      };
    });

    // Sort: Late -> Pending -> Total
    members.sort((a, b) => {
      if (b.lateTasks !== a.lateTasks) return b.lateTasks - a.lateTasks;
      if (b.pendingTasks !== a.pendingTasks) return b.pendingTasks - a.pendingTasks;
      return b.totalTasks - a.totalTasks;
    });

    // 3. Global Stats for cards
    const globalStats = {
      total: 0,
      notStarted: 0,
      waitingFix: 0,
      waitingReview: 0,
      late: 0,
      completed: 0
    };

    const taskIdsFound = new Set();
    filteredUsers.forEach(member => {
      const memberTasks = allTasks.filter(t => t.User === member.Name || t.UserId == member.ID);
      memberTasks.forEach(t => {
        if (!taskIdsFound.has(t.ID)) {
          taskIdsFound.add(t.ID);
          globalStats.total++;
          if (t.Status === 'ยังไม่เริ่ม') globalStats.notStarted++;
          if (t.Status === 'รอแก้ไข') globalStats.waitingFix++;
          if (t.Status === 'รอตรวจ') globalStats.waitingReview++;
          if (t.Status === 'เสร็จสิ้น') globalStats.completed++;
          
          if (t.Status !== 'เสร็จสิ้น' && t.DueDate) {
            const dueDate = new Date(t.DueDate);
            if (dueDate < today) globalStats.late++;
          }
        }
      });
    });

    return { teamMembers: members, stats: globalStats };
  }, [allUsers, allTasks, filterDepartment, isAdmin, userDept, today]);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <LoadingModal isOpen={loading} message="กำลังโหลดข้อมูลทีม..." />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="text-blue-600" /> บุคคลในทีม 
            {!isAdmin && <span className="text-sm font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">({userDept})</span>}
          </h2>
          <p className="text-slate-500">ภาพรวมสถานะงานของสมาชิกในทีม</p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 bg-white/50 p-2 rounded-xl border border-slate-200/60 shadow-sm">
            <Filter size={16} className="text-slate-400 ml-1" />
            <span className="text-sm font-medium text-slate-500">แผนก:</span>
            <CustomSelect
              value={filterDepartment}
              onChange={setFilterDepartment}
              options={departments.map(d => ({ label: d === 'All' ? 'ทุกแผนก' : d, value: d }))}
              className="w-48"
            />
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard 
          icon={<Activity size={24} />} 
          label="งานทั้งหมด" 
          value={stats.total} 
          color="blue" 
        />
        <StatCard 
          icon={<PlayCircle size={24} />} 
          label="ยังไม่เริ่ม" 
          value={stats.notStarted} 
          color="slate" 
        />
        <StatCard 
          icon={<AlertTriangle size={24} />} 
          label="รอแก้ไข" 
          value={stats.waitingFix} 
          color="amber" 
        />
        <StatCard 
          icon={<ClipboardList size={24} />} 
          label="รอตรวจ" 
          value={stats.waitingReview} 
          color="purple" 
        />
        <StatCard 
          icon={<AlertCircle size={24} />} 
          label="เกินกำหนด" 
          value={stats.late} 
          color="red" 
        />
        <StatCard 
          icon={<CheckCircle size={24} />} 
          label="เสร็จสิ้น" 
          value={stats.completed} 
          color="green" 
        />
      </div>

      <div className="glass rounded-2xl border border-slate-200/60 overflow-hidden shadow-sm bg-white/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50/80 text-xs uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold whitespace-nowrap">พนักงาน</th>
                <th className="px-6 py-4 font-semibold text-center whitespace-nowrap">งานในมือ (รอทำ)</th>
                <th className="px-6 py-4 font-semibold text-center whitespace-nowrap">งานส่งช้า</th>
                <th className="px-6 py-4 font-semibold text-center whitespace-nowrap">งานรวมทั้งหมด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teamMembers.length === 0 && !loading ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users size={32} className="text-slate-300" />
                      <p>ไม่พบสมาชิกในทีม</p>
                    </div>
                  </td>
                </tr>
              ) : (
                teamMembers.map((member) => (
                  <tr key={member.ID} className="hover:bg-blue-50/40 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {member.ProfileImage ? (
                          <img src={member.ProfileImage} alt={member.Name} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl shrink-0 border-2 border-white shadow-sm">
                            {(member.Name || member.Username || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{member.Name}</div>
                          <div className="flex gap-2 mt-1">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase tracking-wider">{member.Role}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded tracking-wider">{member.Department}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex flex-col items-center justify-center">
                        <span className={`text-xl font-black ${member.pendingTasks > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                          {member.pendingTasks}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">รอทำ</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex flex-col items-center justify-center">
                        <span className={`text-xl font-black ${member.lateTasks > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                          {member.lateTasks}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">ส่งช้า</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex flex-col items-center justify-center">
                        <span className="text-xl font-black text-slate-700">
                          {member.totalTasks}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">ทั้งหมด</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, color }) => {
  const bgColors = {
    blue: "bg-blue-50/80 text-blue-600 border-blue-100",
    slate: "bg-slate-50/80 text-slate-600 border-slate-100",
    amber: "bg-amber-50/80 text-amber-600 border-amber-100",
    purple: "bg-purple-50/80 text-purple-600 border-purple-100",
    red: "bg-red-50/80 text-red-600 border-red-100",
    green: "bg-green-50/80 text-green-600 border-green-100"
  };

  const textColors = {
    blue: "text-blue-700",
    slate: "text-slate-700",
    amber: "text-amber-700",
    purple: "text-purple-700",
    red: "text-red-700",
    green: "text-green-700"
  };

  return (
    <div className="glass p-4 rounded-2xl border border-white/40 flex items-center gap-4 shadow-sm hover:translate-y-[-2px] transition-all">
      <div className={`p-3 rounded-xl border ${bgColors[color]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide truncate">{label}</p>
        <p className={`text-2xl font-black leading-tight ${textColors[color]}`}>{value}</p>
      </div>
    </div>
  );
};
