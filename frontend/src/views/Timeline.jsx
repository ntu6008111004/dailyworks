import React, { useState, useEffect, useMemo } from 'react';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LoadingModal } from '../components/LoadingModal';
import {
  format, addDays, subDays, isSameMonth,
  startOfMonth, endOfMonth, addMonths, subMonths,
  startOfWeek, endOfWeek, eachDayOfInterval, isToday,
  isWithinInterval
} from 'date-fns';
import th from 'date-fns/locale/th';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';

// ─── Status colours ───────────────────────────────────────────────────────────
const STATUS_COLORS = {
  'ยังไม่เริ่ม': 'bg-slate-200 text-slate-700',
  'กำลังทำ':    'bg-blue-500 text-white',
  'รอตรวจ':    'bg-purple-500 text-white',
  'รอแก้ไข':   'bg-amber-400 text-amber-900',
  'เสร็จสิ้น': 'bg-emerald-500 text-white',
};

const getTaskColor = (task) => {
  const isOverdue = apiService.isOverdue(task);
  if (isOverdue && task.Status === 'เสร็จสิ้น') return 'bg-rose-600 text-white';
  if (isOverdue) return 'bg-red-400 text-white';
  return STATUS_COLORS[task.Status] || 'bg-slate-300 text-slate-700';
};

// ─── Task chip inside a calendar cell ─────────────────────────────────────────
const TaskChip = ({ task, onClick }) => {
  const color = getTaskColor(task);
  const project = task.CustomFields?.Project;
  return (
    <button
      onClick={() => onClick(task)}
      className={`w-full text-left text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md font-medium truncate leading-snug transition-opacity hover:opacity-80 ${color}`}
      title={`${project ? '[' + project + '] ' : ''}${task.Detail} (${task.Status})`}
    >
      {project ? `[${project}] ` : ''}{task.Detail}
    </button>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const Timeline = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [baseDate, setBaseDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('month'); // 'day', 'week', 'month'
  const [selectedTask, setSelectedTask] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchTimeline = async () => {
      try {
        const data = await apiService.getTasksSummary();
        if (isMounted) setTasks(data);
      } catch (error) {
        console.error(error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchTimeline();

    const handleSync = async () => {
      try {
        const data = await apiService.getTasksSummary();
        if (isMounted) setTasks(data);
      } catch (err) {
        console.error('Timeline sync error:', err);
      }
    };

    window.addEventListener('tasks-optimistic-update', handleSync);
    window.addEventListener('cache-cleared', handleSync);

    return () => {
      isMounted = false;
      window.removeEventListener('tasks-optimistic-update', handleSync);
      window.removeEventListener('cache-cleared', handleSync);
    };
  }, []);

  // Filter tasks for current user only
  const userTasks = useMemo(() => {
    const userName = user?.Name || user?.name;
    return tasks
      .filter(t => t.StaffName === userName)
      .map(t => ({
        ...t,
        startDate: new Date(t.StartDate),
        endDate: new Date(t.DueDate),
      }));
  }, [tasks, user]);

  // ─── Navigation ─────────────────────────────────────────────────────────────
  const goToToday = () => setBaseDate(new Date());
  const prevPeriod = () => {
    if (viewMode === 'day') setBaseDate(d => subDays(d, 1));
    else if (viewMode === 'week') setBaseDate(d => subDays(d, 7));
    else setBaseDate(d => subMonths(d, 1));
  };
  const nextPeriod = () => {
    if (viewMode === 'day') setBaseDate(d => addDays(d, 1));
    else if (viewMode === 'week') setBaseDate(d => addDays(d, 7));
    else setBaseDate(d => addMonths(d, 1));
  };

  // ─── Compute visible days ───────────────────────────────────────────────────
  const { calendarDays, title } = useMemo(() => {
    if (viewMode === 'day') {
      return {
        calendarDays: [baseDate],
        title: format(baseDate, 'd MMMM yyyy', { locale: th }),
      };
    }
    if (viewMode === 'week') {
      const wStart = startOfWeek(baseDate, { weekStartsOn: 0 });
      const wEnd = endOfWeek(baseDate, { weekStartsOn: 0 });
      return {
        calendarDays: eachDayOfInterval({ start: wStart, end: wEnd }),
        title: `${format(wStart, 'd MMM', { locale: th })} – ${format(wEnd, 'd MMM yyyy', { locale: th })}`,
      };
    }
    // month
    const mStart = startOfMonth(baseDate);
    const mEnd = endOfMonth(baseDate);
    const gridStart = startOfWeek(mStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(mEnd, { weekStartsOn: 0 });
    return {
      calendarDays: eachDayOfInterval({ start: gridStart, end: gridEnd }),
      title: format(baseDate, 'MMMM yyyy', { locale: th }),
    };
  }, [baseDate, viewMode]);

  // ─── Get tasks for a specific day ───────────────────────────────────────────
  const getTasksForDay = (day) =>
    userTasks.filter(t => {
      const s = t.startDate;
      const e = t.endDate;
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      return isWithinInterval(day, { start: s, end: e });
    });

  const dayNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <LoadingModal isOpen={loading} message="กำลังโหลดข้อมูลปฏิทิน..." />

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">ไทม์ไลน์การทำงาน</h2>
          <p className="text-slate-500 text-sm">แสดงเฉพาะงานของคุณ</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {['day', 'week', 'month'].map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {m === 'day' ? 'วัน' : m === 'week' ? 'สัปดาห์' : 'เดือน'}
              </button>
            ))}
          </div>

          {/* Nav controls */}
          <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 shadow-sm p-1">
            <button onClick={prevPeriod} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <span className="px-3 py-1 font-semibold text-slate-700 text-sm min-w-[160px] text-center">{title}</span>
            <button onClick={nextPeriod} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors">
              <ChevronRight size={18} />
            </button>
            <button
              onClick={goToToday}
              className="ml-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              วันนี้
            </button>
          </div>
        </div>
      </div>

      {/* ── Calendar Grid ── */}
      <div className="glass rounded-2xl border border-slate-200/60 overflow-hidden">
        {/* Day-name header (month/week view only) */}
        {viewMode !== 'day' && (
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {dayNames.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>
        )}

        {/* Day view */}
        {viewMode === 'day' && (
          <div className="p-4 space-y-3">
            <div className={`flex items-center gap-3 pb-3 border-b border-slate-100`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shadow-sm ${
                isToday(baseDate) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {format(baseDate, 'd')}
              </div>
              <div>
                <div className="font-bold text-slate-800">{format(baseDate, 'EEEE', { locale: th })}</div>
                <div className="text-xs text-slate-400">{format(baseDate, 'd MMMM yyyy', { locale: th })}</div>
              </div>
            </div>
            {getTasksForDay(baseDate).length === 0 ? (
              <p className="text-slate-400 text-sm py-8 text-center">ไม่มีงานในวันนี้</p>
            ) : (
              <div className="space-y-2">
                {getTasksForDay(baseDate).map(task => {
                  const color = getTaskColor(task);
                  return (
                    <button
                      key={task.ID}
                      onClick={() => setSelectedTask(task)}
                      className={`w-full text-left px-4 py-3 rounded-xl font-medium transition-opacity hover:opacity-80 ${color}`}
                    >
                      <div className="font-semibold text-sm">{task.CustomFields?.Project && `[${task.CustomFields.Project}] `}{task.Detail}</div>
                      <div className="text-xs opacity-80 mt-0.5">{task.Status} · {task.StaffName}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Week view */}
        {viewMode === 'week' && (
          <div className="grid grid-cols-7 divide-x divide-slate-100 min-h-[300px]">
            {calendarDays.map(day => {
              const dayTasks = getTasksForDay(day);
              return (
                <div key={day.toISOString()} className={`p-1.5 min-h-[160px] ${isToday(day) ? 'bg-blue-50/40' : ''}`}>
                  <div className={`w-7 h-7 mx-auto mb-1 flex items-center justify-center rounded-full text-sm font-bold ${
                    isToday(day) ? 'bg-blue-600 text-white' : 'text-slate-700'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 4).map(task => (
                      <TaskChip key={task.ID} task={task} onClick={setSelectedTask} />
                    ))}
                    {dayTasks.length > 4 && (
                      <span className="text-[10px] text-slate-400 pl-1">+{dayTasks.length - 4} อื่นๆ</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Month view */}
        {viewMode === 'month' && (
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
            {calendarDays.map(day => {
              const dayTasks = getTasksForDay(day);
              const isCurrentMonth = isSameMonth(day, baseDate);
              const today = isToday(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[80px] sm:min-h-[100px] p-1 ${
                    !isCurrentMonth ? 'bg-slate-50/50' : today ? 'bg-blue-50/30' : ''
                  }`}
                >
                  <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold mb-1 ${
                    today
                      ? 'bg-blue-600 text-white'
                      : isCurrentMonth
                        ? 'text-slate-700'
                        : 'text-slate-300'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map(task => (
                      <TaskChip key={task.ID} task={task} onClick={setSelectedTask} />
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="text-[9px] text-slate-400 pl-1">+{dayTasks.length - 3} อื่นๆ</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Status Legend ── */}
      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        {Object.entries(STATUS_COLORS).map(([s, c]) => (
          <span key={s} className={`px-2 py-0.5 rounded-md font-medium ${c}`}>{s}</span>
        ))}
        <span className="px-2 py-0.5 rounded-md font-medium bg-red-400 text-white">ล่าช้า</span>
      </div>

      {/* ── Task Detail Modal ── */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-blue-50/50 rounded-t-3xl">
              <h2 className="text-xl font-bold text-blue-900 flex items-center gap-2">
                <CalendarIcon size={20} className="text-blue-500" />
                รายละเอียดงาน
              </h2>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {selectedTask.CustomFields?.Project && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">โปรเจค</label>
                  <div className="mt-1 font-bold text-indigo-700 text-base">{selectedTask.CustomFields.Project}</div>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">รายละเอียดงาน</label>
                <div className="mt-1 text-slate-900 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-wrap text-sm">
                  {selectedTask.Detail}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ผู้รับผิดชอบ</label>
                  <div className="mt-1 text-slate-900 text-sm">{selectedTask.StaffName}</div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">สถานะ</label>
                  <div className="mt-1">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getTaskColor(selectedTask)}`}>
                      {selectedTask.Status}{apiService.isOverdue(selectedTask) ? ' (ล่าช้า)' : ''}
                    </span>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ช่วงเวลา</label>
                  <div className="mt-1 text-slate-900 text-sm">
                    {format(new Date(selectedTask.StartDate), 'd MMM yyyy', { locale: th })}
                    <span className="text-slate-400 mx-2">→</span>
                    {format(new Date(selectedTask.DueDate), 'd MMM yyyy', { locale: th })}
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end rounded-b-3xl">
              <button
                onClick={() => setSelectedTask(null)}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200/50 rounded-xl transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
