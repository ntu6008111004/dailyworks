import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';

export const NotificationPermissionModal = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Only show the prompt if permission is 'default' and hasn't been dismissed
    const hasDismissed = localStorage.getItem('hideNotiPrompt');
    if (Notification.permission === 'default' && !hasDismissed) {
      // Delay showing it slightly to not clash with initial page load
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAllow = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted' || permission === 'denied') {
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
            ไม่พลาดทุกความเคลื่อนไหว! รับการแจ้งเตือนทันทีเมื่อมีการอัปเดต หรือสั่งแก้ไขบรีฟงานของคุณ
          </p>
        </div>
        <div className="p-6 bg-white flex flex-col gap-3">
          <button 
            onClick={handleAllow}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all active:scale-95"
          >
            อนุญาตการแจ้งเตือน
          </button>
          <button 
            onClick={handleDismiss}
            className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl font-bold transition-all"
          >
            ไว้ก่อน
          </button>
        </div>
      </div>
    </div>
  );
};
