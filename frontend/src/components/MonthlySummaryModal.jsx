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

  // Filter tasks that belong to this month
  const activeTasks = useMemo(() => {
    if (!isOpen) return [];
    return tasks.filter(t => {
      const currentUserId = String(user?.ID || user?.id || '');
      const tUserId = String(t.UserID || '');
      if (tUserId !== currentUserId) return false;

      try {
        let taskStartStr = '';
        let taskDueStr = '';

        if (typeof t.StartDate === 'string') {
          taskStartStr = t.StartDate.substring(0, 7);
        } else if (t.StartDate instanceof Date) {
          taskStartStr = format(t.StartDate, 'yyyy-MM');
        }

        if (typeof t.DueDate === 'string') {
          taskDueStr = t.DueDate.substring(0, 7);
        } else if (t.DueDate instanceof Date) {
          taskDueStr = format(t.DueDate, 'yyyy-MM');
        }
        
        return monthStr >= taskStartStr && monthStr <= taskDueStr;
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
      'รอแก้ไข': 0,
      'ยังไม่เริ่ม': 0
    };
    activeTasks.forEach(t => {
      if (s[t.Status] !== undefined) s[t.Status]++;
    });
    return [
       { name: 'เสร็จสิ้น', value: s['เสร็จสิ้น'], color: '#22c55e' },
       { name: 'กำลังทำ', value: s['กำลังทำ'], color: '#3b82f6' },
       { name: 'รอตรวจ', value: s['รอตรวจ'], color: '#a855f7' },
       { name: 'รอแก้ไข', value: s['รอแก้ไข'], color: '#f59e0b' },
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

      const statusOrder = ['เสร็จสิ้น', 'กำลังทำ', 'รอตรวจ', 'รอแก้ไข', 'ยังไม่เริ่ม'];
      
      statusOrder.forEach(status => {
        if (grouped[status] && grouped[status].length > 0) {
          text += `📌 ${status} (${grouped[status].length} งาน):\n`;
          grouped[status].forEach((t, i) => {
            const projectStr = t.CustomFields?.Project ? `[${t.CustomFields.Project}] ` : '';
            const detailStr = (user?.Permissions?.showFullTaskDetail !== false) ? t.Detail : '';
            text += `  ${i + 1}. ${projectStr}${detailStr}\n`;
          });
          text += '\n';
        }
      });

      return text.trim();
    } catch {
      return '';
    }
  }, [activeTasks, monthStr, user, getPositionName, isOpen]);

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
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-full animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-sky-50/50 rounded-t-3xl">
          <h2 className="text-xl font-bold text-sky-900">สรุปงานรายเดือน</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 flex flex-col md:flex-row gap-8">
          <div className="w-full md:w-1/2 space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">เลือกเดือนที่ต้องการสรุป</label>
              <input
                type="month"
                value={monthStr}
                onChange={(e) => setMonthStr(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all"
              />
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 h-64">
              {stats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {stats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{borderRadius: '0.75rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} itemStyle={{fontWeight: 600}} />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">ไม่มีข้อมูลเพื่อสร้างกราฟ</div>
              )}
            </div>
          </div>

          <div className="w-full md:w-1/2 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-slate-700">ตัวอย่างข้อความสำหรับส่งไลน์</label>
              <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors shadow-sm focus:ring-4 focus:ring-sky-100">
                {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                {copied ? 'คัดลอกสำเร็จ' : 'คัดลอกข้อความ'}
              </button>
            </div>
            <div className="w-full flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl min-h-[300px] whitespace-pre-wrap text-sm text-slate-800 font-mono overflow-y-auto">
              {summaryText}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 rounded-b-3xl">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-xl transition-colors">
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
