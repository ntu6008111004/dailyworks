import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';

export const NotificationPermissionModal = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      const hasDismissed = localStorage.getItem('hideNotiPrompt');
      if (Notification.permission === 'default' && !hasDismissed) {
        // Delay showing it slightly to not clash with initial page load
        const timer = setTimeout(() => setIsOpen(true), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const [showInstructions, setShowInstructions] = useState(false);


  useEffect(() => {
    if ('Notification' in window) {
      const hasDismissed = localStorage.getItem('hideNotiPrompt');
      if (Notification.permission === 'default' && !hasDismissed) {
        // Delay showing it slightly to not clash with initial page load
        const timer = setTimeout(() => setIsOpen(true), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleAllow = async () => {
    try {
      if (!('Notification' in window)) {
        setIsOpen(false);
        return;
      }

      if (Notification.permission === 'denied') {
        setShowInstructions(true);
        return;
      }

      const result = await Notification.requestPermission();
      if (result === 'granted' || result === 'denied') {
        setIsOpen(false);
      }
    } catch (err) {
      console.error(err);
      setIsOpen(false);
    }
  };

  const handleDismiss = () => {
    setIsOpen(false);
    localStorage.setItem('hideNotiPrompt', 'true');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-8 flex flex-col items-center text-center relative">
          <button 
            onClick={handleDismiss}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4 text-white ring-4 ring-white/10">
            <Bell size={28} className="animate-bounce" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">เปิดการแจ้งเตือน</h3>
          <p className="text-blue-100 text-sm leading-relaxed">
            {showInstructions 
              ? "ดูเหมือนคุณจะบล็อกการแจ้งเตือนไว้ กรุณาตรวจสอบการตั้งค่าของบราวเซอร์เพื่อเปิดรับแจ้งเตือนครับ"
              : "เพื่อไม่ให้คุณพลาดงานใหม่ๆ เมื่อกด 'อนุญาต' จะมีหน้าต่างของบราวเซอร์เด้งขึ้นมา ให้เลือก 'อนุญาต (Allow)' อีกครั้งนะครับ"}
          </p>
        </div>
        <div className="p-6 bg-white flex flex-col gap-3">
          {!showInstructions ? (
            <button 
              onClick={handleAllow}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-95"
            >
              อนุญาตการแจ้งเตือน
            </button>
          ) : (
            <div className="text-center p-3 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 mb-2 font-medium">ขั้นตอนการเปิด:</p>
              <ul className="text-[11px] text-slate-600 text-left space-y-1 list-disc pl-4">
                <li>ไปที่ <b>การตั้งค่าบราวเซอร์</b> (รูปแม่กุญแจ หรือจุด 3 จุด)</li>
                <li>หาหัวข้อ <b>สิทธิ์/การแจ้งเตือน (Notifications)</b></li>
                <li>เลือกเป็น <b>อนุญาต (Allow)</b></li>
                <li>รีเฟรชหน้าเว็บนี้อีกครั้ง</li>
              </ul>
            </div>
          )}

          <button 
            onClick={handleDismiss}
            className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl font-bold transition-all"
          >
            {showInstructions ? "รับทราบ" : "ไว้ก่อน"}
          </button>
        </div>

      </div>
    </div>
  );
};
