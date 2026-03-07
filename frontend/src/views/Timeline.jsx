import React, { useState, useEffect, useMemo } from 'react';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LoadingModal } from '../components/LoadingModal';
import { format, addDays, subDays, eachDayOfInterval, isSameDay, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import th from 'date-fns/locale/th';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Filter, X } from 'lucide-react';

export const Timeline = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Timeline viewport configuration
  const [baseDate, setBaseDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('week'); // 'day', 'week', 'month'

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const data = await apiService.getTasksSummary();
      setTasks(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const userName = user?.Name || user?.name;
      if (t.StaffName !== userName) return false;
      return true;
    }).map(t => ({
      ...t,
      start: new Date(t.StartDate),
      end: new Date(t.DueDate)
    })).sort((a, b) => {
      // week/month: newest tasks on top; day: oldest first (chronological)
      if (viewMode === 'day') return a.start - b.start;
      return b.start - a.start;
    });
  }, [tasks, user, viewMode]);

  // Generate days based on view mode
  const timelineDays = useMemo(() => {
    let start, end;
    if (viewMode === 'day') {
      start = subDays(baseDate, 1);
      end = addDays(baseDate, 1);
    } else if (viewMode === 'month') {
      start = startOfMonth(baseDate);
      end = endOfMonth(baseDate);
    } else {
      // week
      start = subDays(baseDate, 3);
      end = addDays(baseDate, 10);
    }
    return eachDayOfInterval({ start, end });
  }, [baseDate, viewMode]);

  const goToToday = () => setBaseDate(new Date());
  const prevPeriod = () => {
    if (viewMode === 'day') setBaseDate(prev => subDays(prev, 1));
    else if (viewMode === 'month') setBaseDate(prev => subMonths(prev, 1));
    else setBaseDate(prev => subDays(prev, 7));
  };
  const nextPeriod = () => {
    if (viewMode === 'day') setBaseDate(prev => addDays(prev, 1));
    else if (viewMode === 'month') setBaseDate(prev => addMonths(prev, 1));
    else setBaseDate(prev => addDays(prev, 7));
  };

  const statusColors = {
    'ยังไม่เริ่ม': 'bg-slate-200 border-slate-300 text-slate-800',
    'กำลังทำ': 'bg-blue-200 border-blue-400 text-blue-900',
    'รอตรวจ': 'bg-purple-200 border-purple-400 text-purple-900',
    'รอแก้ไข': 'bg-amber-200 border-amber-400 text-amber-900',
    'เสร็จสิ้น': 'bg-green-200 border-green-500 text-green-900 hover:bg-green-300',
  };

  const [selectedTask, setSelectedTask] = useState(null);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <LoadingModal isOpen={loading} message="กำลังโหลดข้อมูลตารางเวลา..." />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">ไทม์ไลน์การทำงาน (Timeline)</h2>
          <p className="text-slate-500">ดูภาพรวมของระยะเวลาการทำงาน (เฉพาะงานของคุณ)</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button onClick={() => setViewMode('day')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === 'day' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>วัน</button>
            <button onClick={() => setViewMode('week')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === 'week' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>สัปดาห์</button>
            <button onClick={() => setViewMode('month')} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === 'month' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>เดือน</button>
          </div>

          <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-200">
            <button onClick={prevPeriod} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors">
              <ChevronLeft size={20} />
            </button>
            <button onClick={goToToday} className="px-4 py-2 font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
              วันนี้
            </button>
            <button onClick={nextPeriod} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl border border-slate-200/60 overflow-hidden relative">
        <div className="overflow-x-auto overflow-y-auto max-h-[65vh] w-full custom-scrollbar">
          <div className="flex flex-col min-w-max">
            {/* Timeline Header - Days */}
            <div className="flex border-b border-slate-200 bg-slate-50/95 sticky top-0 z-20">
              <div className="w-48 sm:w-64 shrink-0 border-r border-slate-200 p-4 font-semibold text-slate-700 flex items-center gap-2 sticky left-0 bg-slate-50/95 z-30 shadow-[1px_0_0_0_#e2e8f0]">
                <CalendarIcon size={18} className="text-blue-500" />
                รายละเอียดงาน
              </div>
              <div className="flex" style={{ width: `${timelineDays.length * 4}rem` }}>
                {timelineDays.map(day => (
                  <div
                    key={day.toISOString()}
                    className={`flex-1 flex flex-col items-center justify-center p-2 border-r border-slate-200 text-sm ${isSameDay(day, new Date()) ? 'bg-blue-100/50' : ''}`}
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
            {filteredTasks.length === 0 && !loading && (
              <div className="p-12 text-center text-slate-500 sticky left-0 w-full">ไม่มีข้อมูลงานที่จะแสดง</div>
            )}

            {filteredTasks.map(task => {
              const hasProject = task.CustomFields?.Project;
              return (
                <div
                  key={task.ID}
                  className="flex border-b border-slate-100 hover:bg-slate-50/50 transition-colors group cursor-pointer"
                  onClick={() => setSelectedTask(task)}
                >
                  <div className="w-48 sm:w-64 shrink-0 border-r border-slate-200 p-3 flex flex-col justify-center sticky left-0 bg-white group-hover:bg-slate-50/95 z-20 shadow-[1px_0_0_0_#e2e8f0]">
                    <div className="text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-blue-600 transition-colors" title={task.Detail}>
                      {task.Detail}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-slate-500 font-medium bg-slate-100 px-1.5 py-0.5 rounded">{task.StaffName}</span>
                      {hasProject && <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-1 rounded-sm line-clamp-1">{task.CustomFields.Project}</span>}
                    </div>
                  </div>

                  <div className="relative grid" style={{ width: `${timelineDays.length * 4}rem`, gridTemplateColumns: `repeat(${timelineDays.length}, minmax(4rem, 1fr))` }}>
                    {/* Grid Lines */}
                    {timelineDays.map(day => (
                      <div key={`grid-${day.toISOString()}`} className={`border-r border-slate-100 h-16 ${isSameDay(day, new Date()) ? 'bg-blue-50/30' : ''}`}></div>
                    ))}

                    {/* Task Bar */}
                    {(() => {
                      const startIdx = timelineDays.findIndex(d => isSameDay(d, task.start) || d > task.start);
                      let endIdx = timelineDays.findIndex(d => isSameDay(d, task.end));
                      if (endIdx === -1 && task.end > timelineDays[timelineDays.length - 1]) endIdx = timelineDays.length - 1;

                      if (startIdx === -1 || (endIdx !== -1 && endIdx < 0)) return null;
                      if (task.start > timelineDays[timelineDays.length - 1] || task.end < timelineDays[0]) return null;

                      const activeStartIdx = startIdx === -1 ? 0 : startIdx;
                      const activeEndIdx = endIdx === -1 ? timelineDays.length - 1 : endIdx;
                      const span = activeEndIdx - activeStartIdx + 1;

                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const isOverdue = task.end < today && task.Status !== 'เสร็จสิ้น';

                      const colorClass = isOverdue
                        ? 'bg-red-100 border-red-400 text-red-800'
                        : (statusColors[task.Status] || statusColors['ยังไม่เริ่ม']);

                      return (
                        <div
                          className="absolute h-8 top-1/2 -translate-y-1/2 z-10 px-1 py-1"
                          style={{
                            gridColumnStart: activeStartIdx + 1,
                            gridColumnEnd: activeStartIdx + 1 + span,
                            width: '100%'
                          }}
                        >
                          <div className={`h-full rounded-md border text-[10px] sm:text-xs px-2 flex items-center font-medium shadow-sm transition-all ${colorClass} truncate overflow-hidden whitespace-nowrap`} title={`${task.Detail} (${task.Status}${isOverdue ? ' - ล่าช้า' : ''})`}>
                            {task.Status}{isOverdue && ' (ล่าช้า)'} ({span} วัน)
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

      {/* View Task Modal implementation in timeline */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-full animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-blue-50/50 rounded-t-3xl">
              <h2 className="text-xl font-bold text-blue-900">รายละเอียดงาน (ดูเท่านั้น)</h2>
              <button onClick={() => setSelectedTask(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-left">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">รายละเอียดงาน</label>
                <div className="mt-1 text-slate-900 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-wrap">{selectedTask.Detail}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</label>
                  <div className="mt-1 text-slate-900">{selectedTask.CustomFields?.Project || '-'}</div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ผู้รับผิดชอบ</label>
                  <div className="mt-1 text-slate-900">{selectedTask.StaffName}</div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">สถานะ</label>
                  <div className="mt-1">
                    {(() => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const isOverdue = selectedTask.end < today && selectedTask.Status !== 'เสร็จสิ้น';
                      const colorClass = isOverdue
                        ? 'bg-red-100 text-red-800 border border-red-200'
                        : (statusColors[selectedTask.Status] || 'bg-slate-100 text-slate-700');

                      return (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
                          {selectedTask.Status}{isOverdue ? ' (ล่าช้า)' : ''}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ช่วงเวลา</label>
                  <div className="mt-1 text-slate-900 text-sm">
                    {format(new Date(selectedTask.StartDate), 'd MMM yyyy', { locale: th })} <br />
                    <span className="text-slate-400">ถึง</span> {format(new Date(selectedTask.DueDate), 'd MMM yyyy', { locale: th })}
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end rounded-b-3xl">
              <button onClick={() => setSelectedTask(null)} className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200/50 rounded-xl transition-colors">ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
