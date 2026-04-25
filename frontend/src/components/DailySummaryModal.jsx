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
      className="ios-glass-overlay p-4 sm:p-6 !z-[60]"
      onClick={handleBackdropClick}
    >
      <div className="ios-soft-card w-full max-w-lg flex flex-col max-h-full relative shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Accent Line */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-500" />

        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">สรุปงานประจำวัน</h2>
            <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest mt-1">LINE Report Generator</p>
          </div>
          <button onClick={onClose} className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all border border-slate-200">
            <X size={22} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto flex-1 space-y-8 custom-scrollbar">
          <div className="ios-glass-pill p-2 pl-4 flex items-center bg-white/40">
            <CustomDatePicker
              label="เลือกวันที่"
              selectedDate={date}
              onChange={(newDate) => setDate(newDate)}
            />
          </div>

          <div className="space-y-3">
            <label className="block text-[13px] font-bold text-slate-500 mb-2 uppercase tracking-wider ml-1">ตัวอย่างข้อความที่จะส่ง</label>
            <div className="w-full px-6 py-5 bg-slate-50/50 border border-slate-200 rounded-3xl min-h-[180px] whitespace-pre-wrap text-[14px] text-slate-800 leading-loose shadow-inner">
              <div className="font-bold mb-4">
                ชื่อ: {user?.Name || '-'}<br />
                ตำแหน่ง: {positionName || '-'}<br />
                สรุปผลการปฏิบัติงาน<br />
                วันที่ {format(new Date(date), 'dd MMMM yyyy', { locale: th })}
              </div>
              
              <div className="space-y-3">
                {activeTasks.length === 0 ? (
                  <p className="italic text-slate-400">- ไม่มีข้อมูลงานในวันนี้ -</p>
                ) : (
                  activeTasks.map((t, i) => (
                    <div key={i} className="flex flex-col">
                      <span className="font-bold">
                        {i + 1}. {t.CustomFields?.Project ? `[${t.CustomFields.Project}] ` : ''}
                      </span>
                      <span className="font-normal text-slate-600 pl-4">
                        - {t.Detail}
                      </span>
                      <span className="font-bold text-slate-500 text-[12px] pl-4">
                        (สถานะ: {t.Status})
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-3 text-sm font-black text-slate-500 hover:text-slate-800 hover:bg-white rounded-2xl border border-slate-200 transition-all"
          >
            ปิดหน้าต่าง
          </button>
          <button
            onClick={handleCopy}
            className={`flex items-center justify-center gap-3 px-8 py-3 text-sm font-black text-white rounded-2xl transition-all shadow-lg ${
              copied ? 'bg-emerald-500 scale-95' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
            }`}
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
