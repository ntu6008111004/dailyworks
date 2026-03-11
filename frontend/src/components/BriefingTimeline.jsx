import React, { useState } from 'react';
import {
  format, startOfMonth, endOfMonth, addMonths, subMonths,
  startOfWeek, endOfWeek, eachDayOfInterval, isToday, isSameMonth
} from 'date-fns';
import th from 'date-fns/locale/th';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { apiService } from '../services/api';

const STATUS_COLORS = {
  'รอดำเนินการ': 'bg-slate-600 text-white shadow-sm',
  'กำลังทำ':    'bg-blue-600 text-white shadow-sm',
  'รอตรวจ':    'bg-[#f472b6] text-white shadow-sm font-bold',
  'รอแก้ไข':   'bg-yellow-400 text-yellow-950 shadow-sm font-bold',
  'เสร็จสิ้น': 'bg-[#198754] text-white shadow-sm font-bold',
  'ยกเลิกงาน': 'bg-zinc-600 text-white shadow-sm',
  'Overdue': 'bg-rose-600 text-white shadow-sm',
};

export const BriefingTimeline = ({ briefings, onBriefingClick }) => {
  const [baseDate, setBaseDate] = useState(new Date());
  
  const mStart = startOfMonth(baseDate);
  const mEnd = endOfMonth(baseDate);
  const gridStart = startOfWeek(mStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(mEnd, { weekStartsOn: 0 });
  
  const calendarDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const title = format(baseDate, 'MMMM yyyy', { locale: th });

  const getBriefingsForDay = (day) => {
    return briefings.filter(b => {
      const due = new Date(b.DueDate);
      due.setHours(0, 0, 0, 0);
      const d = new Date(day);
      d.setHours(0, 0, 0, 0);
      return due.getTime() === d.getTime();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <CalendarIcon size={20} className="text-blue-500" />
          ปฏิทินงานบรีฟ (Due Dates)
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setBaseDate(subMonths(baseDate, 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><ChevronLeft size={20}/></button>
          <span className="font-bold text-slate-700 min-w-[140px] text-center">{title}</span>
          <button onClick={() => setBaseDate(addMonths(baseDate, 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><ChevronRight size={20}/></button>
          <button onClick={() => setBaseDate(new Date())} className="ml-2 text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">วันนี้</button>
        </div>
      </div>

      {/* Legend section */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
        {Object.entries(STATUS_COLORS).map(([status, classes]) => (
          <div key={status} className="flex items-center gap-1.5 grayscale-[0.3]">
            <div className={`w-3 h-3 rounded-full ${classes.split(' ')[0]} shadow-sm`} />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{status}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl overflow-hidden mt-2">
        {['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'].map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 border-l border-t border-slate-100 rounded-b-2xl overflow-hidden bg-white">
        {calendarDays.map(day => {
          const dayBriefings = getBriefingsForDay(day);
          const isCurrMonth = isSameMonth(day, baseDate);
          const today = isToday(day);
          
          return (
            <div key={day.toISOString()} className={`min-h-[100px] p-1.5 ${!isCurrMonth ? 'bg-slate-50/30 opacity-40' : today ? 'bg-blue-50/20' : ''}`}>
               <div className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold mb-1 ${today ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : isCurrMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                 {format(day, 'd')}
               </div>
               <div className="space-y-1">
                  {dayBriefings.map(b => {
                    const status = apiService.isBriefingOverdue(b) ? 'Overdue' : b.Status;
                    const color = STATUS_COLORS[status] || 'bg-slate-300';
                    return (
                      <button 
                        key={b.ID}
                        onClick={() => onBriefingClick(b)}
                        className={`w-full text-left text-[9px] font-bold px-1.5 py-1 rounded-md truncate shadow-sm transition-all hover:scale-[1.02] active:scale-95 ${color}`}
                      >
                        {b.RunningID}: {b.Detail}
                      </button>
                    )
                  })}
               </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
