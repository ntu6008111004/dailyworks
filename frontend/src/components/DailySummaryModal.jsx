import React, { useState } from 'react';
import { X, Copy, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import th from 'date-fns/locale/th';

export const DailySummaryModal = ({ isOpen, onClose, tasks, user }) => {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [copied, setCopied] = useState(false);

  // Filter tasks that belong to this date
  const activeTasks = tasks.filter(t => {
    const isOwner = user?.Role === 'Staff' ? t.StaffName === (user?.Name || user?.name) : true;
    if (!isOwner) return false;

    try {
      // Use local date string for comparison to avoid timezone shifts from toISOString
      const tStart = format(new Date(t.StartDate), 'yyyy-MM-dd');
      const tDue = format(new Date(t.DueDate), 'yyyy-MM-dd');
      
      return date >= tStart && date <= tDue;
    } catch (e) {
      console.error("Date parsing error for task:", t.ID, e);
      return false;
    }
  });

  let summaryText = `สรุปผลการปฏิบัติงาน\nวันที่ ${format(new Date(date), 'dd MMMM yyyy', { locale: th })}\n\n`;
  
  if (activeTasks.length === 0) {
    summaryText += "- ไม่มีข้อมูลงานในวันนี้ -";
  } else {
    activeTasks.forEach((t, i) => {
      const projectStr = t.CustomFields?.Project ? `[${t.CustomFields.Project}] ` : '';
      summaryText += `${i + 1}. ${projectStr}${t.Detail} (สถานะ: ${t.Status})\n`;
    });
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(summaryText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-full animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-blue-50/50 rounded-t-3xl">
          <h2 className="text-xl font-bold text-blue-900">สรุปงานประจำวันส่งไลน์</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">เลือกวันที่ต้องการสรุป</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ตัวอย่างข้อความ</label>
            <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl min-h-[150px] whitespace-pre-wrap text-sm text-slate-800 font-mono">
              {summaryText}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 rounded-b-3xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-xl transition-colors"
          >
            ปิดหน้าต่าง
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors shadow-sm focus:ring-4 focus:ring-green-100"
          >
            {copied ? (
              <>
                <CheckCircle size={18} />
                คัดลอกสำเร็จ!
              </>
            ) : (
              <>
                <Copy size={18} />
                คัดลอกข้อความ
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
