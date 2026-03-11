import React, { useState } from 'react';
import { X, Copy, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import th from 'date-fns/locale/th';
import { useAuth } from '../context/AuthContext';
import { CustomDatePicker } from './CustomDatePicker';

export const DailySummaryModal = ({ isOpen, onClose, tasks, user, closeOnOutsideClick = true }) => {
  const { getPositionName } = useAuth();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (closeOnOutsideClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  // Filter tasks that belong to this date
  const activeTasks = tasks.filter(t => {
    const currentUserId = String(user?.ID || user?.id || '');
    const tUserId = String(t.UserID || '');
    if (tUserId !== currentUserId) return false;

    try {
      const tStart = format(new Date(t.StartDate), 'yyyy-MM-dd');
      const tDue = format(new Date(t.DueDate), 'yyyy-MM-dd');
      return date >= tStart && date <= tDue;
    } catch {
      return false;
    }
  });

  const posId = user?.Position || user?.CustomFields?.Position;
  const positionName = getPositionName(posId);

  let summaryText = `ชื่อ: ${user?.Name || '-'}\n`;
  summaryText += `ตำแหน่ง: ${positionName || '-'}\n`;
  summaryText += `สรุปผลการปฏิบัติงาน\nวันที่ ${format(new Date(date), 'dd MMMM yyyy', { locale: th })}\n\n`;
  
  if (activeTasks.length === 0) {
    summaryText += "- ไม่มีข้อมูลงานในวันนี้ -";
  } else {
    activeTasks.forEach((t, i) => {
      const projectStr = t.CustomFields?.Project ? `[${t.CustomFields.Project}] ` : '';
      const detailStr = (user?.Permissions?.showFullTaskDetail !== false) ? t.Detail : '';
      summaryText += `${i + 1}. ${projectStr}${detailStr} (สถานะ: ${t.Status})\n`;
    });
  }

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
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-full animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-blue-50/50 rounded-t-3xl">
          <h2 className="text-xl font-bold text-blue-900">สรุปงานประจำวันส่งไลน์</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <CustomDatePicker
            label="เลือกวันที่ต้องการสรุป"
            selectedDate={date}
            onChange={(newDate) => setDate(newDate)}
          />

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
