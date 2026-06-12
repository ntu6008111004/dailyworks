import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Users, Filter, Award, CheckCircle2, Activity, Calendar, Clock, RotateCcw } from 'lucide-react';
import { LoadingModal } from '../components/LoadingModal';
import { CustomSelect } from '../components/CustomSelect';

export const MyTeam = () => {
  const { user, getPositionName } = useAuth();
  const [allUsers, setAllUsers] = useState([]);
  const [allBriefings, setAllBriefings] = useState([]);
  const [allResponses, setAllResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDepartment, setFilterDepartment] = useState('All');
  
  // Date range filters (YYYY-MM-DD)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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
      const [usersData, briefingsData, responsesData] = await Promise.all([
        apiService.getUsers({ includeImage: true }),
        apiService.getBriefings(),
        apiService.getBriefingResponses(undefined, 'ID, BriefingID, UserID, Status, UpdatedAt')
      ]);
      
      setAllUsers(usersData || []);
      setAllBriefings(briefingsData || []);
      setAllResponses(responsesData || []);
      
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
    const nonAdmins = allUsers.filter(u => u.Role !== 'Admin');
    const depts = new Set(nonAdmins.map(u => u.Department).filter(Boolean));
    return ['All', ...Array.from(depts).sort()];
  }, [allUsers]);

  const { teamMembers, stats } = useMemo(() => {
    // 1. Filter users based on department (exclude Admins)
    const nonAdminUsers = allUsers.filter(u => u.Role !== 'Admin');
    let filteredUsers = nonAdminUsers;
    if (filterDepartment !== 'All') {
      filteredUsers = nonAdminUsers.filter(u => u.Department === filterDepartment);
    } else if (!isAdmin) {
      // Non-admins (Heads) only see their department
      filteredUsers = nonAdminUsers.filter(u => u.Department === userDept);
    }

    // 2. Map stats per member
    const members = filteredUsers.map(member => {
      let totalPoints = 0;
      let completedCount = 0;
      let inProgressCount = 0;
      let notStartedCount = 0;
      let briefedCompletedCount = 0;
      let briefedInProgressCount = 0;
      let briefedNotStartedCount = 0;
      
      allBriefings.forEach(b => {
        const isCreator = String(b.CreatorID) === String(member.ID);
        const isAssignee = Array.isArray(b.Assignees) && b.Assignees.some(id => String(id) === String(member.ID));
        
        if (!isCreator && !isAssignee) return;
        
        // Find individual assignee response for this briefing to get individual status for points
        const memberResponse = allResponses.find(r => String(r.BriefingID) === String(b.ID) && String(r.UserID) === String(member.ID));
        let memberStatus = memberResponse?.Status || 'รอดำเนินการ';
        
        // If overall briefing is completed, individual status is also completed
        if (b.Status === 'เสร็จสิ้น') {
          memberStatus = 'เสร็จสิ้น';
        }
        
        // Determine if completed/active from this user's perspective
        const isCompleted = (isAssignee && memberStatus === 'เสร็จสิ้น') || (isCreator && b.Status === 'เสร็จสิ้น');
        
        // Check date filter range based on overall status (matches activeBriefings card calculation)
        const dateStr = b.Status === 'เสร็จสิ้น' 
          ? (b.CompletedAt || b.UpdatedAt || b.CreatedAt)
          : (b.StartDate || b.CreatedAt);
          
        if (dateStr) {
          const targetDate = dateStr.slice(0, 10); // YYYY-MM-DD
          if (startDate && targetDate < startDate) return;
          if (endDate && targetDate > endDate) return;
        }

        // Award points if completed from this user's perspective
        if (isCompleted) {
          totalPoints += parseInt(b.Points) || 0;
        }

        // Assignee and Creator roles for counts to prevent duplicate count on same user
        const isUserAssignee = isAssignee;
        const isUserCreator = isCreator && !isAssignee;

        if (isUserAssignee) {
          if (b.Status === 'เสร็จสิ้น') {
            completedCount++;
          } else if (['กำลังทำ', 'รอตรวจ', 'รอแก้ไข', 'รอแก้'].includes(b.Status)) {
            inProgressCount++;
          } else if (b.Status === 'รอดำเนินการ') {
            notStartedCount++;
          }
        } else if (isUserCreator) {
          if (b.Status === 'เสร็จสิ้น') {
            briefedCompletedCount++;
          } else if (['กำลังทำ', 'รอตรวจ', 'รอแก้ไข', 'รอแก้'].includes(b.Status)) {
            briefedInProgressCount++;
          } else if (b.Status === 'รอดำเนินการ') {
            briefedNotStartedCount++;
          }
        }
      });
      
      return {
        ...member,
        totalPoints,
        completedCount,
        inProgressCount,
        notStartedCount,
        briefedCompletedCount,
        briefedInProgressCount,
        briefedNotStartedCount
      };
    });
    
    // Sort: total points descending (leaderboard style)
    members.sort((a, b) => b.totalPoints - a.totalPoints);

    // 4. Calculate total team statistics by summing individual unique briefings related to the filtered users
    let teamCompleted = 0;
    let teamInProgress = 0;
    let teamNotStarted = 0;

    const filteredUserIds = new Set(filteredUsers.map(u => String(u.ID)));

    allBriefings.forEach(b => {
      const isCreatorInTeam = filteredUserIds.has(String(b.CreatorID));
      const hasAssigneeInTeam = Array.isArray(b.Assignees) && b.Assignees.some(id => filteredUserIds.has(String(id)));

      if (!isCreatorInTeam && !hasAssigneeInTeam) return;

      const dateStr = b.Status === 'เสร็จสิ้น' 
        ? (b.CompletedAt || b.UpdatedAt || b.CreatedAt)
        : (b.StartDate || b.CreatedAt);
        
      if (dateStr) {
        const targetDate = dateStr.slice(0, 10);
        if (startDate && targetDate < startDate) return;
        if (endDate && targetDate > endDate) return;
      }

      if (b.Status === 'เสร็จสิ้น') {
        teamCompleted++;
      } else if (['กำลังทำ', 'รอตรวจ', 'รอแก้ไข', 'รอแก้'].includes(b.Status)) {
        teamInProgress++;
      } else if (b.Status === 'รอดำเนินการ') {
        teamNotStarted++;
      }
    });

    const teamStats = {
      totalMembers: members.length,
      totalPointsAcrossTeam: members.reduce((sum, m) => sum + m.totalPoints, 0),
      totalCompletedAcrossTeam: teamCompleted,
      totalInProgressAcrossTeam: teamInProgress,
      totalNotStartedAcrossTeam: teamNotStarted
    };

    return { teamMembers: members, stats: teamStats };
  }, [allUsers, allBriefings, allResponses, filterDepartment, isAdmin, userDept, startDate, endDate]);

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    if (isAdmin) {
      setFilterDepartment('All');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <LoadingModal isOpen={loading} message="กำลังโหลดข้อมูลทีม..." />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="text-blue-600" /> ผลงานและคะแนนของบุคคลในทีม 
            {!isAdmin && <span className="text-sm font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">({userDept})</span>}
          </h2>
          <p className="text-slate-500">ติดตามคะแนนสะสมและสถานะงานบรีฟของลูกทีม</p>
        </div>

        {/* Filters Panel */}
        <div className="flex flex-wrap items-center gap-3 bg-white/60 p-3 rounded-2xl border border-slate-200/60 shadow-sm backdrop-blur-md">
          {isAdmin && (
            <div className="flex items-center gap-1.5 min-w-[150px]">
              <Filter size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">แผนก:</span>
              <CustomSelect
                value={filterDepartment}
                onChange={setFilterDepartment}
                options={departments.map(d => ({ label: d === 'All' ? 'ทุกแผนก' : d, value: d }))}
                className="w-36 text-xs"
              />
            </div>
          )}
          
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500">วันที่เริ่มต้น:</span>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 font-medium text-slate-700"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">สิ้นสุด:</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500 font-medium text-slate-700"
            />
          </div>

          {(startDate || endDate || (isAdmin && filterDepartment !== 'All')) && (
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-lg text-xs font-bold transition-colors"
              title="ล้างตัวกรองทั้งหมด"
            >
              <RotateCcw size={12} />
              ล้างค่า
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard 
          icon={<Users size={20} />} 
          label="สมาชิกทั้งหมด" 
          value={stats.totalMembers} 
          subtext="ในแผนกที่เลือก"
          color="blue" 
        />
        <StatCard 
          icon={<Award size={20} />} 
          label="คะแนนรวมของทีม" 
          value={stats.totalPointsAcrossTeam} 
          subtext="คำนวณตามตัวกรอง"
          color="purple" 
        />
        <StatCard 
          icon={<CheckCircle2 size={20} />} 
          label="งานบรีฟเสร็จสิ้น" 
          value={stats.totalCompletedAcrossTeam} 
          subtext="ผลงานสำเร็จสะสม"
          color="emerald" 
        />
        <StatCard 
          icon={<Activity size={20} />} 
          label="งานบรีฟดำเนินการอยู่" 
          value={stats.totalInProgressAcrossTeam} 
          subtext="กำลังทำ / รอตรวจ / รอแก้ไข"
          color="amber" 
        />
        <StatCard 
          icon={<Clock size={20} />} 
          label="งานบรีฟยังไม่เริ่ม" 
          value={stats.totalNotStartedAcrossTeam} 
          subtext="รอดำเนินการ"
          color="slate" 
        />
      </div>

      {/* Members Leaderboard Table */}
      <div className="glass rounded-2xl border border-slate-200/60 overflow-hidden shadow-sm bg-white/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50/80 text-xs uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold whitespace-nowrap">พนักงาน</th>
                <th className="px-6 py-4 font-semibold text-center whitespace-nowrap">คะแนนรวมสะสม</th>
                <th className="px-6 py-4 font-semibold text-center whitespace-nowrap">บรีฟเสร็จสิ้น (งาน)</th>
                <th className="px-6 py-4 font-semibold text-center whitespace-nowrap">บรีฟดำเนินการ (งาน)</th>
                <th className="px-6 py-4 font-semibold text-center whitespace-nowrap">บรีฟยังไม่เริ่ม (งาน)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teamMembers.length === 0 && !loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users size={32} className="text-slate-300" />
                      <p>ไม่พบสมาชิกในทีม</p>
                    </div>
                  </td>
                </tr>
              ) : (
                teamMembers.map((member, idx) => (
                  <tr key={member.ID} className="transition-colors group hover:bg-blue-50/20">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xl shrink-0 border-2 border-white shadow-sm overflow-hidden">
                            {member.ProfileImage && member.ProfileImage !== 'has_image' ? (
                              <img src={member.ProfileImage} alt={member.Name} className="w-full h-full object-cover" />
                            ) : (
                              (member.Name || member.Username || 'U').charAt(0).toUpperCase()
                            )}
                          </div>
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
                    
                    {/* Points Total */}
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex flex-col items-center justify-center w-20 h-16 rounded-2xl bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-100 group-hover:from-purple-100 group-hover:to-indigo-100 group-hover:shadow-sm transition-all">
                        <span className="text-2xl font-black text-purple-700 flex items-center gap-0.5">
                          {member.totalPoints}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-purple-400 font-black">คะแนน</span>
                      </div>
                    </td>

                    {/* Briefings Completed */}
                    <td className="px-6 py-4 text-center">
                      <RenderBriefCount 
                        assigneeCount={member.completedCount} 
                        creatorCount={member.briefedCompletedCount} 
                        type="completed" 
                      />
                    </td>

                    {/* Briefings In Progress */}
                    <td className="px-6 py-4 text-center">
                      <RenderBriefCount 
                        assigneeCount={member.inProgressCount} 
                        creatorCount={member.briefedInProgressCount} 
                        type="inProgress" 
                      />
                    </td>

                    {/* Briefings Not Started */}
                    <td className="px-6 py-4 text-center">
                      <RenderBriefCount 
                        assigneeCount={member.notStartedCount} 
                        creatorCount={member.briefedNotStartedCount} 
                        type="notStarted" 
                      />
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

const RenderBriefCount = ({ assigneeCount, creatorCount, type }) => {
  const isZero = assigneeCount === 0 && creatorCount === 0;

  const config = {
    completed: {
      borderHover: 'group-hover:border-emerald-100',
      assigneeBg: 'bg-emerald-50 text-emerald-700 border border-emerald-100/50',
      creatorBg: 'bg-teal-50 text-teal-700 border border-teal-100/50',
    },
    inProgress: {
      borderHover: 'group-hover:border-blue-100',
      assigneeBg: 'bg-blue-50 text-blue-700 border border-blue-100/50',
      creatorBg: 'bg-amber-50 text-amber-700 border border-amber-100/50',
    },
    notStarted: {
      borderHover: 'group-hover:border-slate-200',
      assigneeBg: 'bg-slate-100 text-slate-600 border border-slate-200/30',
      creatorBg: 'bg-zinc-100 text-zinc-600 border border-zinc-200/30',
    }
  };

  const current = config[type];

  return (
    <div className={`inline-flex flex-col items-center justify-center w-28 min-h-[4.2rem] py-2 px-2.5 rounded-2xl bg-slate-50/50 border border-slate-100 group-hover:bg-white ${current.borderHover} group-hover:shadow-sm transition-all gap-1.5`}>
      {isZero ? (
        <span className="text-slate-300 font-bold text-base">-</span>
      ) : (
        <div className="flex flex-col gap-1 w-full text-[10px]">
          {assigneeCount > 0 && (
            <div className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded font-bold ${current.assigneeBg}`}>
              <span>รับมอบ</span>
              <span className="font-black text-xs">{assigneeCount}</span>
            </div>
          )}
          {creatorCount > 0 && (
            <div className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded font-bold ${current.creatorBg}`}>
              <span>มอบหมาย</span>
              <span className="font-black text-xs">{creatorCount}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const StatCard = ({ icon, label, value, subtext, color }) => {
  const bgColors = {
    blue: "bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200",
    purple: "bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200",
    emerald: "bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200",
    amber: "bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200",
    slate: "bg-gradient-to-br from-slate-50 to-slate-100/50 border-slate-200",
  };

  const textColors = {
    blue: "text-blue-700",
    purple: "text-purple-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    slate: "text-slate-700",
  };

  const iconBgColors = {
    blue: "bg-blue-600 text-white shadow-blue-200",
    purple: "bg-purple-600 text-white shadow-purple-200",
    emerald: "bg-emerald-500 text-white shadow-emerald-200",
    amber: "bg-amber-500 text-white shadow-amber-200",
    slate: "bg-slate-600 text-white shadow-slate-200",
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
