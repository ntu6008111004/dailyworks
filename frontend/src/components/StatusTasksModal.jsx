import React, { useMemo, useState } from 'react';
import { X, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import th from 'date-fns/locale/th';

export const StatusTasksModal = ({ isOpen, onClose, status, tasks, userRole }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const totalPages = Math.ceil((tasks?.length || 0) / itemsPerPage);
  
  const paginatedTasks = useMemo(() => {
    if (!tasks) return [];
    const start = (currentPage - 1) * itemsPerPage;
    return tasks.slice(start, start + itemsPerPage);
  }, [tasks, currentPage]);

  const groupedTasks = useMemo(() => {
    if (!paginatedTasks || paginatedTasks.length === 0) return {};

    // For Staff, or if viewing a single user filter, don't group, just use 'งานของคุณ'
    if (userRole === 'Staff') {
      return { 'งานของคุณ': paginatedTasks };
    }

    // For Head / Admin / HR seeing multiple people, group by StaffName
    const groups = {};
    paginatedTasks.forEach(t => {
      const name = t.StaffName || 'ไม่ระบุชื่อ';
      if (!groups[name]) groups[name] = [];
      groups[name].push(t);
    });
    
    // Sort names alphabetically
    return Object.keys(groups).sort().reduce((acc, key) => {
      acc[key] = groups[key];
      return acc;
    }, {});
  }, [paginatedTasks, userRole]);

  if (!isOpen) return null;

  const statusColors = {
    'ทั้งหมด': 'text-blue-900 bg-blue-100',
    'กำลังทำ': 'text-blue-900 bg-blue-100',
    'ยังไม่เริ่ม': 'text-slate-800 bg-slate-200',
    'รอตรวจ': 'text-purple-900 bg-purple-200',
    'เสร็จสิ้น': 'text-green-900 bg-green-200',
    'เกินกำหนด': 'text-red-900 bg-red-200',
    'ล่าช้า': 'text-red-600 bg-red-50 border-red-100'
  };

  const headerColor = statusColors[status] || statusColors['ทั้งหมด'];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 ios-glass-overlay animate-in fade-in duration-300">
      <div className="ios-soft-card w-full max-w-4xl flex flex-col max-h-[92vh] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className={`px-8 py-6 border-b border-slate-100 flex items-center justify-between ${headerColor.replace('bg-', 'bg-opacity-5 bg-')}`}>
          <div className="flex flex-col">
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
              รายการงาน: {status} 
              <span className="text-sm font-black bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full border border-blue-100 shadow-sm">{tasks.length} งาน</span>
            </h2>
            <p className="text-[11px] text-slate-500 font-extrabold uppercase tracking-wider mt-1">รายการบันทึกงานในระบบตามสถานะที่เลือก</p>
          </div>
          <button onClick={onClose} className="p-2.5 bg-white/30 hover:bg-white/50 rounded-full transition-all active:scale-90 border border-white/40 shadow-sm">
            <X size={20} className="text-slate-700" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {tasks.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4">
               <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                 <Calendar size={32} />
               </div>
               <p className="font-bold">ไม่มีงานในสถานะนี้</p>
             </div>
          ) : (
            <div className="space-y-8 pb-4">
              {Object.entries(groupedTasks).map(([employee, empTasks]) => (
                <div key={employee} className="ios-glass-pill p-1 rounded-3xl overflow-hidden border border-white/40 shadow-sm bg-white/30">
                  {userRole !== 'Staff' && Object.keys(groupedTasks).length > 1 && (
                    <div className="bg-white/40 px-5 py-3 border-b border-white/20 font-bold text-slate-800 flex justify-between items-center backdrop-blur-md">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">
                          {employee.charAt(0)}
                        </div>
                        <span>{employee}</span>
                      </div>
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 uppercase tracking-widest">{empTasks.length} งาน</span>
                    </div>
                  )}
                  <div className="divide-y divide-white/10">
                    {empTasks.map(task => (
                      <div key={task.ID} className="p-5 hover:bg-white/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-5 group">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[14px] font-bold text-indigo-700 bg-white/60 px-3 py-1 rounded-xl border border-white shadow-sm leading-tight">
                              {task.CustomFields?.Project || 'ทั่วไป'}
                            </span>
                            <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider shadow-sm border border-white/20 ${headerColor}`}>
                              {task.Status}
                            </span>
                          </div>
                          
                          <p className="text-sm text-slate-700 line-clamp-2 leading-relaxed font-medium" title={task.Detail}>
                            {task.Detail}
                          </p>
                          
                          <div className="flex items-center gap-3 opacity-60">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest bg-slate-100 px-1.5 py-0.5 rounded">ID: #{String(task.ID).slice(-4)}</span>
                            {task.CustomFields?.Department && (
                              <span className="text-[9px] text-blue-600 font-bold uppercase tracking-widest">{task.CustomFields.Department}</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-white/50 px-4 py-2.5 rounded-2xl shrink-0 w-fit border border-white shadow-sm">
                          <Calendar size={14} className="text-blue-500"/>
                          <div className="flex flex-col">
                            <span className="text-[8px] text-slate-400 uppercase tracking-tighter">กำหนดส่ง</span>
                            <span>{task.DueDate ? format(new Date(task.DueDate), 'd MMM yyyy', { locale: th }) : 'ไม่มีกำหนดส่ง'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2 pt-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    หน้า <span className="text-blue-600">{currentPage}</span> / {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="p-2.5 bg-white/40 border border-white/60 rounded-2xl hover:bg-white/60 disabled:opacity-30 transition-all shadow-sm active:scale-90"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2.5 bg-white/40 border border-white/60 rounded-2xl hover:bg-white/60 disabled:opacity-30 transition-all shadow-sm active:scale-90"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-5 border-t border-white/20 bg-white/30 backdrop-blur-xl flex justify-end gap-3">
          <button
            onClick={onClose}
            className="ios-glass-btn px-8 py-3 rounded-2xl text-white font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
          >
            ตกลง รับทราบ
          </button>
        </div>
      </div>
    </div>
  );
};

