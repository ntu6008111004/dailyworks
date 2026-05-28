import React, { useState, useMemo } from 'react';
import { X, Copy, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import th from 'date-fns/locale/th';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useAuth } from '../context/AuthContext';

export const MonthlySummaryModal = ({ isOpen, onClose, tasks, user, closeOnOutsideClick = true }) => {
  const { getPositionName } = useAuth();
  const [monthStr, setMonthStr] = useState(format(new Date(), 'yyyy-MM'));
  const [copied, setCopied] = useState(false);
  const [showFullDetail, setShowFullDetail] = useState(true);

  // Filter tasks that belong to this month
  const activeTasks = useMemo(() => {
    if (!isOpen) return [];
    return tasks.filter(t => {
      const currentUserId = String(user?.ID || user?.id || '');
      const tUserId = String(t.UserID || '');
      if (tUserId !== currentUserId) return false;

      try {
        let taskStartMonth = '';
        let taskDueMonth = '';

        if (typeof t.StartDate === 'string' && t.StartDate.length >= 7) {
          taskStartMonth = t.StartDate.substring(0, 7);
        } else if (t.StartDate instanceof Date) {
          taskStartMonth = format(t.StartDate, 'yyyy-MM');
        }

        if (typeof t.DueDate === 'string' && t.DueDate.length >= 7) {
          taskDueMonth = t.DueDate.substring(0, 7);
        } else if (t.DueDate instanceof Date) {
          taskDueMonth = format(t.DueDate, 'yyyy-MM');
        }

        // Case 1: Both dates exist — check if month falls within the range
        if (taskStartMonth && taskDueMonth) {
          return monthStr >= taskStartMonth && monthStr <= taskDueMonth;
        }
        // Case 2: Only StartDate — match if it's in the selected month
        if (taskStartMonth && !taskDueMonth) {
          return taskStartMonth === monthStr;
        }
        // Case 3: Only DueDate — match if it's in the selected month
        if (!taskStartMonth && taskDueMonth) {
          return taskDueMonth === monthStr;
        }
        // Case 4: No dates at all — fallback to CreatedAt month
        if (t.CreatedAt) {
          const createdMonth = typeof t.CreatedAt === 'string'
            ? t.CreatedAt.substring(0, 7)
            : format(new Date(t.CreatedAt), 'yyyy-MM');
          return createdMonth === monthStr;
        }
        return false;
      } catch {
        return false;
      }
    });
  }, [tasks, user, monthStr, isOpen]);

  const stats = useMemo(() => {
    const s = {
      'เสร็จสิ้น': 0,
      'กำลังทำ': 0,
      'รอตรวจ': 0,
      'ยังไม่เริ่ม': 0
    };
    activeTasks.forEach(t => {
      if (s[t.Status] !== undefined) s[t.Status]++;
    });
    return [
       { name: 'เสร็จสิ้น', value: s['เสร็จสิ้น'], color: '#22c55e' },
       { name: 'กำลังทำ', value: s['กำลังทำ'], color: '#3b82f6' },
       { name: 'รอตรวจ', value: s['รอตรวจ'], color: '#a855f7' },
       { name: 'ยังไม่เริ่ม', value: s['ยังไม่เริ่ม'], color: '#94a3b8' }
    ].filter(i => i.value > 0);
  }, [activeTasks]);

  const summaryText = useMemo(() => {
    if (!isOpen) return '';
    try {
      const posId = user?.Position || user?.CustomFields?.Position;
      const positionName = getPositionName(posId);

      let text = `ชื่อ: ${user?.Name || '-'}\n`;
      text += `ตำแหน่ง: ${positionName || '-'}\n`;
      text += `สรุปผลการปฏิบัติงาน\nประจำเดือน ${format(new Date(monthStr + '-01'), 'MMMM yyyy', { locale: th })}\n\n`;
      
      if (activeTasks.length === 0) {
        return text + "- ไม่มีข้อมูลงานในเดือนนี้ -";
      }

      text += `📊 มีงานทั้งหมดจำนวน ${activeTasks.length} งาน\n\n`;

      const grouped = {};
      activeTasks.forEach(t => {
        if (!grouped[t.Status]) grouped[t.Status] = [];
        grouped[t.Status].push(t);
      });

      const statusOrder = ['เสร็จสิ้น', 'กำลังทำ', 'รอตรวจ', 'ยังไม่เริ่ม'];
      
      statusOrder.forEach(status => {
        if (grouped[status] && grouped[status].length > 0) {
          text += `📌 ${status} (${grouped[status].length} งาน):\n`;
          grouped[status].forEach((t, i) => {
            const projectStr = t.CustomFields?.Project ? `[${t.CustomFields.Project}] ` : '';
            const detailStr = (showFullDetail && user?.Permissions?.showFullTaskDetail !== false) ? t.Detail : '';
            text += `  ${i + 1}. ${projectStr}${detailStr}\n`;
          });
          text += '\n';
        }
      });

      return text.trim();
    } catch {
      return '';
    }
  }, [activeTasks, monthStr, user, getPositionName, isOpen, showFullDetail]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (closeOnOutsideClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(summaryText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div 
      className="ios-glass-overlay p-4 sm:p-6 !z-[60]"
      onClick={handleBackdropClick}
    >
      <div className="ios-soft-card w-full max-w-5xl flex flex-col max-h-full relative shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Accent Line */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500" />

        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">สรุปผลงานรายเดือน</h2>
            <p className="text-[11px] font-bold text-sky-600 uppercase tracking-widest mt-1">Monthly Productivity Insight</p>
          </div>
          <button onClick={onClose} className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all border border-slate-200">
            <X size={22} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto flex-1 flex flex-col lg:flex-row gap-10 custom-scrollbar">
          {/* Left Column: Month Selector & Chart */}
          <div className="w-full lg:w-5/12 space-y-8">
            <div className="group">
              <label className="block text-[14px] font-bold text-slate-900 mb-2 uppercase tracking-wider ml-1">เลือกเดือนที่ต้องการสรุป</label>
              <input
                type="month"
                value={monthStr}
                onChange={(e) => setMonthStr(e.target.value)}
                className="w-full px-5 py-4 bg-white border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all font-semibold text-slate-900"
              />
            </div>

            <div className="ios-glass-pill p-6 border-white/40 h-[320px] flex flex-col">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">สถิติสถานะงาน</h3>
              <div className="flex-1">
                {stats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stats} cx="50%" cy="50%" innerRadius={65} outerRadius={85} paddingAngle={8} dataKey="value" stroke="none">
                        {stats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{
                          background: 'rgba(255,255,255,0.8)', 
                          backdropFilter: 'blur(10px)', 
                          borderRadius: '16px', 
                          border: '1px solid rgba(255,255,255,0.5)',
                          boxShadow: '0 10px 20px rgba(0,0,0,0.05)',
                          padding: '10px 14px'
                        }} 
                        itemStyle={{fontWeight: 600, fontSize: '12px', color: '#1e293b'}} 
                      />
                      <Legend 
                        verticalAlign="bottom" 
                        height={40} 
                        formatter={(val) => <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tighter">{val}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <p className="text-sm font-bold uppercase tracking-widest opacity-50">No Data Available</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Text Preview */}
          <div className="w-full lg:w-7/12 flex flex-col h-full min-h-[400px]">
            <div className="flex justify-between items-center mb-3 px-1">
              <div className="flex items-center gap-4">
                <label className="block text-[13px] font-bold text-slate-500 uppercase tracking-wider">ตัวอย่างข้อความรายงาน</label>
                <button 
                  onClick={() => setShowFullDetail(!showFullDetail)}
                  className={`text-[10px] font-black px-3 py-1 rounded-full transition-all flex items-center gap-2 border ${
                    showFullDetail 
                      ? 'bg-sky-500/10 text-sky-600 border-sky-200' 
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${showFullDetail ? 'bg-sky-500 animate-pulse' : 'bg-slate-300'}`} />
                  {showFullDetail ? 'ซ่อนรายละเอียด' : 'แสดงรายละเอียด'}
                </button>
              </div>
              <button 
                onClick={handleCopy} 
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold text-white rounded-xl transition-all shadow-md ${
                  copied ? 'bg-emerald-500 scale-95' : 'bg-sky-600 hover:bg-sky-700 active:scale-95'
                }`}
              >
                {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                {copied ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}
              </button>
            </div>
            <div className="w-full flex-1 px-6 py-5 bg-slate-50/50 border border-slate-200 rounded-3xl whitespace-pre-wrap text-[14px] text-slate-800 leading-loose shadow-inner overflow-y-auto custom-scrollbar">
              <div className="font-bold mb-6">
                ชื่อ: {user?.Name || '-'}<br />
                ตำแหน่ง: {getPositionName(user?.Position || user?.CustomFields?.Position) || '-'}<br />
                สรุปผลการปฏิบัติงาน<br />
                ประจำเดือน {format(new Date(monthStr + '-01'), 'MMMM yyyy', { locale: th })}
                <div className="mt-2 text-sky-600">📊 มีงานทั้งหมดจำนวน {activeTasks.length} งาน</div>
              </div>

              <div className="space-y-6">
                {(() => {
                  const grouped = {};
                  activeTasks.forEach(t => {
                    if (!grouped[t.Status]) grouped[t.Status] = [];
                    grouped[t.Status].push(t);
                  });
                  const statusOrder = ['เสร็จสิ้น', 'กำลังทำ', 'รอตรวจ', 'ยังไม่เริ่ม'];
                  
                  return statusOrder.map(status => {
                    if (!grouped[status] || grouped[status].length === 0) return null;
                    return (
                      <div key={status} className="space-y-2">
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-400" />
                          📌 {status} ({grouped[status].length} งาน):
                        </div>
                        <div className="space-y-3 pl-4">
                          {grouped[status].map((t, i) => (
                            <div key={i} className="flex flex-col">
                              <span className="font-bold text-slate-700">
                                {i + 1}. {t.CustomFields?.Project ? `[${t.CustomFields.Project}] ` : ''}
                              </span>
                              {showFullDetail && (
                                <span className="font-normal text-slate-600 pl-4">
                                  - {t.Detail}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button onClick={onClose} className="px-8 py-3 text-sm font-black text-slate-500 hover:text-slate-800 hover:bg-white rounded-2xl border border-slate-200 transition-all">
            ปิดหน้าต่างข้อมูล
          </button>
        </div>
      </div>
    </div>
  );
};
