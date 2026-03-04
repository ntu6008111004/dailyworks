import React, { useMemo } from 'react';
import { X, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import th from 'date-fns/locale/th';

export const StatusTasksModal = ({ isOpen, onClose, status, tasks, userRole }) => {
  const groupedTasks = useMemo(() => {
    if (!tasks || tasks.length === 0) return {};

    // For Staff, or if viewing a single user filter, don't group, just use 'งานของคุณ'
    if (userRole === 'Staff') {
      return { 'งานของคุณ': tasks };
    }

    // For Head / Admin / HR seeing multiple people, group by StaffName
    const groups = {};
    tasks.forEach(t => {
      const name = t.StaffName || 'ไม่ระบุชื่อ';
      if (!groups[name]) groups[name] = [];
      groups[name].push(t);
    });
    
    // Sort names alphabetically
    return Object.keys(groups).sort().reduce((acc, key) => {
      acc[key] = groups[key];
      return acc;
    }, {});
  }, [tasks, userRole]);

  if (!isOpen) return null;

  const statusColors = {
    'ทั้งหมด': 'text-blue-900 bg-blue-100',
    'กำลังทำ': 'text-blue-900 bg-blue-100',
    'ยังไม่เริ่ม': 'text-slate-800 bg-slate-200',
    'รอแก้ไข': 'text-amber-900 bg-amber-200',
    'รอตรวจ': 'text-purple-900 bg-purple-200',
    'เสร็จสิ้น': 'text-green-900 bg-green-200',
    'เกินกำหนด': 'text-red-900 bg-red-200'
  };

  const headerColor = statusColors[status] || statusColors['ทั้งหมด'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-full animate-in fade-in zoom-in-95 duration-200">
        <div className={`px-6 py-4 border-b border-slate-100 flex items-center justify-between rounded-t-3xl ${headerColor.replace('text-', 'bg-opacity-50 text-')}`}>
          <h2 className="text-xl font-bold flex items-center gap-2">
            รายการงาน: {status} 
            <span className="text-sm font-medium bg-white/50 px-2 py-0.5 rounded-full">{tasks.length}</span>
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
          {tasks.length === 0 ? (
             <div className="flex items-center justify-center h-48 text-slate-400">
               ไม่มีงานในสถานะนี้
             </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedTasks).map(([employee, empTasks]) => (
                <div key={employee} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  {userRole !== 'Staff' && Object.keys(groupedTasks).length > 1 && (
                    <div className="bg-slate-100/80 px-4 py-2 border-b border-slate-200 font-bold text-slate-800 flex justify-between items-center">
                      <span>{employee}</span>
                      <span className="text-xs font-medium text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">{empTasks.length} งาน</span>
                    </div>
                  )}
                  <div className="divide-y divide-slate-100">
                    {empTasks.map(task => (
                      <div key={task.ID} className="p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1">
                          <h4 className="font-bold text-slate-900">{task.Detail}</h4>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5 line-clamp-1">
                            {task.CustomFields?.Project && (
                              <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-sm line-clamp-1 uppercase tracking-wider font-semibold">
                                {task.CustomFields.Project}
                              </span>
                            )}
                            <span className="text-xs text-slate-400">ID: #{String(task.ID).slice(-4)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg shrink-0 w-fit">
                          <Calendar size={14} className="text-slate-400"/>
                          {format(new Date(task.StartDate), 'd MMM yyyy', { locale: th })} 
                          <span className="mx-1 text-slate-400">-</span> 
                          {format(new Date(task.DueDate), 'd MMM yyyy', { locale: th })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3 rounded-b-3xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
