import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, X, Sparkles, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

// The build time injected version
/* global __APP_VERSION__ */
const CURRENT_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 0;

export const UpdateNotifier = () => {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const checkInterval = useRef(null);

  const checkForUpdates = async () => {
    try {
      // Add a random query parameter to bypass cache fully
      const res = await fetch(`/version.json?t=${new Date().getTime()}`);
      if (!res.ok) return;
      const data = await res.json();
      
      if (data.timestamp > CURRENT_VERSION && CURRENT_VERSION !== 0) {
        const timestampStr = String(data.timestamp);
        
        // If user already dismissed this specific update in this session, don't nag
        if (sessionStorage.getItem('dismissed_update') === timestampStr) {
          return;
        }

        // If user clicked update but we are still stuck on the old version (stubborn cache or dev server)
        if (sessionStorage.getItem('attempted_update') === timestampStr) {
          if (!sessionStorage.getItem('notified_stale_update')) {
            toast.error('ยังคงแสดงผลเวอร์ชันเก่า กรุณาล้างแคชเบราว์เซอร์ด้วยตนเอง (Ctrl+F5)', { duration: 5000, position: 'bottom-right' });
            sessionStorage.setItem('notified_stale_update', 'true');
          }
          return; // Break the infinite loop
        }

        setUpdateInfo(data);
      }
    } catch (err) {
      console.error('Failed to check for updates:', err);
    }
  };

  useEffect(() => {
    // Check initially after a brief delay so it doesn't block rendering
    setTimeout(checkForUpdates, 3000);
    
    // Check every 5 minutes
    checkInterval.current = setInterval(checkForUpdates, 5 * 60 * 1000);
    
    // Also check when window regains focus
    window.addEventListener('focus', checkForUpdates);
    
    return () => {
      clearInterval(checkInterval.current);
      window.removeEventListener('focus', checkForUpdates);
    };
  }, []);

  const handleUpdate = async () => {
    setIsUpdating(true);
    toast.success('กำลังเคลียร์ข้อมูลเก่าเพื่ออัปเดต...', { icon: '🧹', position: 'bottom-center' });
    
    // Mark this version as attempted so we don't loop if it fails to fetch the new bundle
    if (updateInfo?.timestamp) {
      sessionStorage.setItem('attempted_update', String(updateInfo.timestamp));
      sessionStorage.removeItem('notified_stale_update');
    }

    // Clear potentially stale caches programatically if using Service Workers/CacheStorage
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      } catch (e) {
        console.error('Cache clear failed', e);
      }
    }
    
    // Slight delay to allow toast to show and cache to clear
    setTimeout(() => {
      // Use query param to try and force a hard load
      window.location.href = window.location.pathname + '?v=' + new Date().getTime();
    }, 1500);
  };

  const handleDismiss = () => {
    if (updateInfo?.timestamp) {
      sessionStorage.setItem('dismissed_update', String(updateInfo.timestamp));
    }
    setIsHidden(true);
  };

  if (!updateInfo || isHidden) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300 p-4">
      <div className="bg-white rounded-3xl shadow-2xl overflow-hidden max-w-md w-full animate-in zoom-in-95 slide-in-from-bottom-5 duration-500 border border-t-[6px] border-t-purple-500">
        
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-purple-50 to-fuchsia-50 p-5 pb-4 flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-100 text-purple-600 rounded-2xl animate-bounce shadow-sm">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-purple-900 leading-tight">พบเวอร์ชันใหม่!</h3>
              <p className="text-xs font-bold text-purple-600 mt-0.5 tracking-wider uppercase">อัปเดตล่าสุดระบบพร้อมใช้งาน</p>
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 hover:bg-white p-1.5 rounded-full transition-all border border-transparent hover:border-slate-200"
            title="เดี๋ยวก่อน"
          >
            <X size={20} />
          </button>
        </div>

        {/* Changelog Content */}
        <div className="p-5 pb-6">
          <p className="text-sm font-medium text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
            " แวะอัปเดตสักครู่ เพื่อการทำงานที่เสถียรยิ่งขึ้นและเห็นข้อมูลตรงกับทุกคนในทีม! ข้อมูลคุณจะยังคงปลอดภัย "
          </p>

          <div className="space-y-2 mb-6 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
            {updateInfo.changelog && updateInfo.changelog.length > 0 ? (
              updateInfo.changelog.map((log, i) => (
                <div key={i} className="flex gap-2.5 text-sm text-slate-700 items-start">
                  <CheckCircle2 className="text-green-500 mt-0.5 shrink-0" size={16} />
                  <span className="leading-snug">{log}</span>
                </div>
              ))
            ) : (
              <div className="flex gap-2.5 text-sm text-slate-700 items-start">
                <CheckCircle2 className="text-green-500 mt-0.5 shrink-0" size={16} />
                <span>ปรับปรุงประสิทธิภาพและความเสถียรของระบบ</span>
              </div>
            )}
          </div>

          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className={`w-full py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 text-white font-bold transition-all ${
              isUpdating ? 'bg-purple-400 cursor-not-allowed scale-95' : 'bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/40 active:scale-95'
            }`}
          >
            {isUpdating ? (
              <>
                <RefreshCw size={20} className="animate-spin" />
                กำลังอัปเดต...
              </>
            ) : (
              <>
                <RefreshCw size={20} />
                อัปเดตระบบเลย
              </>
            )}
          </button>
          
          <p className="text-center text-[10px] text-slate-400 mt-4 uppercase tracking-widest font-medium">
            Version ID: {updateInfo.timestamp}
          </p>
        </div>
      </div>
    </div>
  );
};
