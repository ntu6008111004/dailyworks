import React, { useState, useEffect, useMemo } from 'react';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LoadingModal } from '../components/LoadingModal';
import { format, addDays, subDays, eachDayOfInterval, isSameDay } from 'date-fns';
import th from 'date-fns/locale/th';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Filter } from 'lucide-react';

export const Timeline = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Timeline viewport configuration
  const [baseDate, setBaseDate] = useState(new Date());
  
  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const data = await apiService.getTasks();
      setTasks(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Filter tasks similarly to how Dashboard / Tasks work
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // Role filtering
      const userRole = user?.Role || user?.role;
      const userName = user?.Name || user?.name;
      
      if (userRole === 'Staff' && t.StaffName !== userName) return false;
      if (userRole === 'Head' && t.Department !== user?.Department) return false;
      
      return true;
    }).map(t => ({
      ...t,
      // Ensure we have Date objects
      start: new Date(t.StartDate),
      end: new Date(t.DueDate)
    })).sort((a, b) => a.start - b.start);
  }, [tasks, user]);

  // Generate an array of 14 days centered around baseDate
  const timelineDays = useMemo(() => {
    const start = subDays(baseDate, 3); // 3 days before
    const end = addDays(baseDate, 10);  // 10 days after (14 days total view)
    return eachDayOfInterval({ start, end });
  }, [baseDate]);

  const goToToday = () => setBaseDate(new Date());
  const prevWeek = () => setBaseDate(prev => subDays(prev, 7));
  const nextWeek = () => setBaseDate(prev => addDays(prev, 7));

  const statusColors = {
    'ยังไม่เริ่ม': 'bg-slate-200 border-slate-300 text-slate-800',
    'กำลังทำ': 'bg-blue-200 border-blue-400 text-blue-900',
    'รอตรวจ': 'bg-purple-200 border-purple-400 text-purple-900',
    'รอแก้ไข': 'bg-amber-200 border-amber-400 text-amber-900',
    'เสร็จสิ้น': 'bg-green-200 border-green-500 text-green-900 hover:bg-green-300',
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <LoadingModal isOpen={loading} message="กำลังโหลดข้อมูลตารางเวลา..." />
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">ไทม์ไลน์การทำงาน (Timeline)</h2>
          <p className="text-slate-500">ดูภาพรวมของระยะเวลาการทำงานแต่ละโปรเจค</p>
        </div>

        <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-200">
          <button onClick={prevWeek} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <button onClick={goToToday} className="px-4 py-2 font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            วันนี้
          </button>
          <button onClick={nextWeek} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl border border-slate-200/60 overflow-hidden flex flex-col">
        {/* Timeline Header - Days */}
        <div className="flex border-b border-slate-200 bg-slate-50/80">
          <div className="w-48 sm:w-64 shrink-0 border-r border-slate-200 p-4 font-semibold text-slate-700 flex items-center gap-2">
            <CalendarIcon size={18} className="text-blue-500" />
            ชื่องาน
          </div>
          <div className="flex-1 overflow-x-auto relative hidden-scrollbar" style={{ display: 'grid', gridTemplateColumns: `repeat(${timelineDays.length}, minmax(4rem, 1fr))` }}>
            {timelineDays.map(day => (
              <div 
                key={day.toISOString()} 
                className={`flex flex-col items-center justify-center p-2 border-r border-slate-200 text-sm ${isSameDay(day, new Date()) ? 'bg-blue-100/50' : ''}`}
              >
                <span className="text-xs text-slate-500 font-medium">{format(day, 'EEE', { locale: th })}</span>
                <span className={`font-bold ${isSameDay(day, new Date()) ? 'text-blue-700' : 'text-slate-700'}`}>
                  {format(day, 'd')}
                </span>
                <span className="text-[10px] text-slate-400">{format(day, 'MMM', { locale: th })}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline Body - Tasks */}
        <div className="flex-1 overflow-y-auto max-h-[60vh]">
          {filteredTasks.length === 0 && !loading && (
            <div className="p-12 text-center text-slate-500">ไม่มีข้อมูลงานที่จะแสดง</div>
          )}
          
          {filteredTasks.map(task => {
            const hasProject = task.CustomFields?.Project;
            return (
              <div key={task.ID} className="flex border-b border-slate-100 hover:bg-slate-50/50 transition-colors group">
                <div className="w-48 sm:w-64 shrink-0 border-r border-slate-200 p-3 flex flex-col justify-center">
                  <div className="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-blue-600 transition-colors" title={task.Detail}>
                    {task.Detail}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500 font-medium bg-slate-100 px-1.5 py-0.5 rounded">{task.StaffName}</span>
                    {hasProject && <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-1 rounded-sm line-clamp-1">{task.CustomFields.Project}</span>}
                  </div>
                </div>

                <div className="flex-1 relative min-w-0 overflow-x-auto hidden-scrollbar" style={{ display: 'grid', gridTemplateColumns: `repeat(${timelineDays.length}, minmax(4rem, 1fr))` }}>
                  {/* Grid Lines */}
                  {timelineDays.map(day => (
                    <div key={`grid-${day.toISOString()}`} className={`border-r border-slate-100 h-full w-full ${isSameDay(day, new Date()) ? 'bg-blue-50/30' : ''}`}></div>
                  ))}

                  {/* Task Bar */}
                  {(() => {
                    // Logic to draw the bar
                    // Find first day that falls in the timeline
                    const startIdx = timelineDays.findIndex(d => isSameDay(d, task.start) || d > task.start);
                    // Find last day
                    let endIdx = timelineDays.findIndex(d => isSameDay(d, task.end));
                    if(endIdx === -1 && task.end > timelineDays[timelineDays.length - 1]) endIdx = timelineDays.length - 1;

                    // If task doesn't overlap with our visible 14 days, don't render a bar
                    if (startIdx === -1 || (endIdx !== -1 && endIdx < 0)) return null;
                    if (task.start > timelineDays[timelineDays.length - 1] || task.end < timelineDays[0]) return null;

                    const activeStartIdx = startIdx === -1 ? 0 : startIdx;
                    const activeEndIdx = endIdx === -1 ? timelineDays.length - 1 : endIdx;
                    const span = activeEndIdx - activeStartIdx + 1;

                    const colorClass = statusColors[task.Status] || statusColors['ยังไม่เริ่ม'];

                    return (
                      <div 
                        className="absolute h-8 top-1/2 -translate-y-1/2 z-10 px-1 py-1"
                        style={{ 
                          gridColumnStart: activeStartIdx + 1, 
                          gridColumnEnd: activeStartIdx + 1 + span,
                          width: '100%'
                        }}
                      >
                        <div className={`h-full rounded-md border text-[10px] sm:text-xs px-2 flex items-center font-medium shadow-sm transition-all shadow-sm ${colorClass} truncate overflow-hidden whitespace-nowrap`} title={`${task.Detail} (${task.Status})`}>
                          {task.Status} ({span} วัน)
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
