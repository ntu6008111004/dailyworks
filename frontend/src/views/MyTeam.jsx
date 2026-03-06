import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Users, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { LoadingModal } from '../components/LoadingModal';

export const MyTeam = () => {
  const { user } = useAuth();
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeamData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTeamData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Users
      let users = await apiService.getUsers();
      
      // Filter based on role
      if (user.Role !== 'Admin') {
        users = users.filter(u => u.Department === user.Department);
      }
      
      // 2. Fetch Tasks Summary to calculate stats
      // Assume getTasksSummary gives us enough info to calculate stats
      const tasks = await apiService.getTasksSummary();
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 3. Map tasks to users
      const memberStats = users.map(member => {
        const memberTasks = tasks.filter(t => t.User === member.Name || t.UserId == member.ID);
        
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

      // Sort by late -> pending -> total
      memberStats.sort((a, b) => {
        if (b.lateTasks !== a.lateTasks) return b.lateTasks - a.lateTasks;
        if (b.pendingTasks !== a.pendingTasks) return b.pendingTasks - a.pendingTasks;
        return b.totalTasks - a.totalTasks;
      });

      setTeamMembers(memberStats);
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <LoadingModal isOpen={loading} message="กำลังโหลดข้อมูลทีม..." />
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="text-blue-600" /> บุคคลในทีม 
            {user.Role !== 'Admin' && <span className="text-sm font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">({user.Department})</span>}
          </h2>
          <p className="text-slate-500">ภาพรวมสถานะงานของสมาชิกในทีม</p>
        </div>
      </div>

      <div className="glass rounded-xl border border-slate-200/60 overflow-hidden shadow-sm">
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
                  <tr key={member.ID} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {member.ProfileImage ? (
                          <img src={member.ProfileImage} alt={member.Name} className="w-10 h-10 rounded-full object-cover border border-slate-200" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg shrink-0">
                            {(member.Name || member.Username || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-900">{member.Name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{member.Role} • {member.Department}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex flex-col items-center justify-center">
                        <span className={`text-lg font-bold ${member.pendingTasks > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                          {member.pendingTasks}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">รอทำ</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex flex-col items-center justify-center">
                        <span className={`text-lg font-bold ${member.lateTasks > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {member.lateTasks}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">ส่งช้า</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex flex-col items-center justify-center">
                        <span className="text-lg font-bold text-slate-700">
                          {member.totalTasks}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">รวม</span>
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
