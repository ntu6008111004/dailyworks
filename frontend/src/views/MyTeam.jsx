import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Users, Filter, Flame, Clock, Coffee, ShieldAlert } from 'lucide-react';
import { LoadingModal } from '../components/LoadingModal';
import { CustomSelect } from '../components/CustomSelect';

export const MyTeam = () => {
  const { user } = useAuth();
  const [allUsers, setAllUsers] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDepartment, setFilterDepartment] = useState('All');
  const [positions, setPositions] = useState([]);

  const userRole = user?.Role || user?.role || 'Staff';
  const userDept = user?.Department || user?.department || '';
  const isAdmin = userRole === 'Admin';

  useEffect(() => {
    fetchInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [usersData, tasksData, posData] = await Promise.all([
        apiService.getUsers(),
        apiService.getTasksSummary(),
        apiService.getPositions().catch(() => [])
      ]);
      
      setAllUsers(usersData);
      setAllTasks(tasksData);
      setPositions(posData);
      
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
        const dueDate = t.DueDate ? new Date(t.DueDate).setHours(0, 0, 0, 0) : null;
        if (t.Status !== 'เสร็จสิ้น') {
          pending++;
          if (dueDate && today.getTime() > dueDate) {
            late++;
          }
        } else if (dueDate && t.CompletedAt) {
          const completedDate = new Date(t.CompletedAt).setHours(0, 0, 0, 0);
          if (completedDate > dueDate) {
            late++;
          }
        }
      });
      
      return {
        ...member,
        totalTasks: memberTasks.length,
        pendingTasks: pending,
        lateTasks: late,
        isHighWorkload: pending > 5,
        hasOverdue: late > 0,
        isAvailable: pending === 0
      };
    });

    // Sort: Late -> High Workload -> Pending -> Total
    members.sort((a, b) => {
      if (b.lateTasks !== a.lateTasks) return b.lateTasks - a.lateTasks;
      if (b.isHighWorkload !== a.isHighWorkload) return (b.isHighWorkload ? 1 : 0) - (a.isHighWorkload ? 1 : 0);
      if (b.pendingTasks !== a.pendingTasks) return b.pendingTasks - a.pendingTasks;
      return b.totalTasks - a.totalTasks;
    });

    // 3. Team Health Stats for cards (People-centric)
    const teamStats = {
      totalMembers: members.length,
      highWorkloadCount: members.filter(m => m.isHighWorkload).length,
      hasOverdueCount: members.filter(m => m.hasOverdue).length,
      availableCount: members.filter(m => m.isAvailable).length,
      totalPendingAcrossTeam: members.reduce((sum, m) => sum + m.pendingTasks, 0),
      totalOverdueAcrossTeam: members.reduce((sum, m) => sum + m.lateTasks, 0)
    };

    return { teamMembers: members, stats: teamStats };
  }, [allUsers, allTasks, filterDepartment, isAdmin, userDept, today]);

  const getPositionName = (id) => {
    const pos = positions.find(p => p.ID === id);
    return pos ? pos.Name : id;
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <LoadingModal isOpen={loading} message="กำลังโหลดข้อมูลทีม..." />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="text-blue-600" /> สถานะบุคคลในทีม 
            {!isAdmin && <span className="text-sm font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">({userDept})</span>}
          </h2>
          <p className="text-slate-500">ติดตามภาระงานและความคืบหน้าของลูกทีม</p>
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

      {/* Team Health Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          icon={<Users size={24} />} 
          label="สมาชิกทั้งหมด" 
          value={stats.totalMembers} 
          subtext={`งานรอทำรวม ${stats.totalPendingAcrossTeam} งาน`}
          color="blue" 
        />
        <StatCard 
          icon={<Flame size={24} />} 
          label="งานล้นมือ (> 5 งาน)" 
          value={stats.highWorkloadCount} 
          subtext="ต้องการความช่วยเหลือ"
          color="amber" 
        />
        <StatCard 
          icon={<ShieldAlert size={24} />} 
          label="มีงานส่งช้า" 
          value={stats.hasOverdueCount} 
          subtext={`รวมทั้งหมด ${stats.totalOverdueAcrossTeam} งาน`}
          color="red" 
        />
        <StatCard 
          icon={<Coffee size={24} />} 
          label="ว่าง / เคลียร์งานแล้ว" 
          value={stats.availableCount} 
          subtext="พร้อมรับงานใหม่"
          color="emerald" 
        />
      </div>

      <div className="glass rounded-2xl border border-slate-200/60 overflow-hidden shadow-sm bg-white/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50/80 text-xs uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold whitespace-nowrap">พนักงาน</th>
                <th className="px-6 py-4 font-semibold text-center whitespace-nowrap flex-1">สถานะภาระงาน</th>
                <th className="px-6 py-4 font-semibold text-center whitespace-nowrap">งานในมือ (รอทำ)</th>
                <th className="px-6 py-4 font-semibold text-center whitespace-nowrap">งานส่งช้า</th>
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
                  <tr key={member.ID} className={`transition-colors group ${member.hasOverdue ? 'hover:bg-red-50/30' : member.isHighWorkload ? 'hover:bg-amber-50/30' : 'hover:bg-blue-50/20'}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {member.ProfileImage ? (
                            <img src={member.ProfileImage} alt={member.Name} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xl shrink-0 border-2 border-white shadow-sm">
                              {(member.Name || member.Username || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                          {/* Indicator Dot */}
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm ${member.hasOverdue ? 'bg-red-500' : member.isHighWorkload ? 'bg-amber-500' : member.isAvailable ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{member.Name}</div>
                          <div className="flex gap-2 mt-1">
                            {getPositionName(member.Position) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded tracking-wider">
                                {getPositionName(member.Position)}
                              </span>
                            )}
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded tracking-wider">{member.Department}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        {member.hasOverdue && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full border border-red-200 whitespace-nowrap">
                            <Clock size={12} /> มีงานส่งช้า
                          </span>
                        )}
                        {member.isHighWorkload && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200 whitespace-nowrap">
                            <Flame size={12} /> งานล้นมือ
                          </span>
                        )}
                        {member.isAvailable && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full border border-emerald-200 whitespace-nowrap">
                            <Coffee size={12} /> ว่าง
                          </span>
                        )}
                        {!member.hasOverdue && !member.isHighWorkload && !member.isAvailable && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100 whitespace-nowrap">
                            ปกติ
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-slate-50/50 border border-slate-100 group-hover:bg-white group-hover:shadow-sm transition-all">
                        <span className={`text-2xl font-black ${member.pendingTasks > 5 ? 'text-amber-600' : 'text-slate-700'}`}>
                          {member.pendingTasks}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">รอทำ</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-slate-50/50 border border-slate-100 group-hover:bg-white group-hover:shadow-sm transition-all">
                        <span className={`text-2xl font-black ${member.lateTasks > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                          {member.lateTasks}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">ส่งช้า</span>
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

const StatCard = ({ icon, label, value, subtext, color }) => {
  const bgColors = {
    blue: "bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200",
    amber: "bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200",
    red: "bg-gradient-to-br from-red-50 to-red-100/50 border-red-200",
    emerald: "bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200",
  };

  const textColors = {
    blue: "text-blue-700",
    amber: "text-amber-700",
    red: "text-red-700",
    emerald: "text-emerald-700",
  };

  const iconBgColors = {
    blue: "bg-blue-600 text-white shadow-blue-200",
    amber: "bg-amber-500 text-white shadow-amber-200",
    red: "bg-red-500 text-white shadow-red-200",
    emerald: "bg-emerald-500 text-white shadow-emerald-200",
  };

  return (
    <div className={`p-5 rounded-2xl border flex flex-col gap-3 shadow-sm hover:-translate-y-1 transition-transform cursor-default ${bgColors[color]}`}>
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-xl shadow-sm ${iconBgColors[color]}`}>
          {icon}
        </div>
        <div className="text-right">
          <p className={`text-3xl font-black leading-none mb-1 ${textColors[color]}`}>{value}</p>
        </div>
      </div>
      <div>
        <p className={`text-sm font-bold truncate ${textColors[color]}`}>{label}</p>
        {subtext && <p className="text-[10px] font-medium text-slate-500/80 mt-1 uppercase tracking-wider truncate">{subtext}</p>}
      </div>
    </div>
  );
};
