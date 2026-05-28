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
      
      const serverVersion = data.lastUpdated || data.timestamp || 0;
      
      if (serverVersion > CURRENT_VERSION && CURRENT_VERSION !== 0) {
        const timestampStr = String(serverVersion);
        
        // If user already dismissed this specific update, don't nag
        if (localStorage.getItem('dismissed_update') === timestampStr) {
          return;
        }

        // If user clicked update but we are still stuck on the old version
        if (localStorage.getItem('attempted_update') === timestampStr) {
          if (!localStorage.getItem('notified_stale_update')) {
            toast.error('ยังคงแสดงผลเวอร์ชันเก่า กรุณาล้างแคชเบราว์เซอร์ด้วยตนเอง (Ctrl+F5)', { duration: 5000, position: 'bottom-right' });
            localStorage.setItem('notified_stale_update', 'true');
          }
          return; 
        }

        setUpdateInfo({ ...data, timestamp: serverVersion });
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
      localStorage.setItem('attempted_update', String(updateInfo.timestamp));
      localStorage.removeItem('notified_stale_update');
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
      localStorage.setItem('dismissed_update', String(updateInfo.timestamp));
    }
    setIsHidden(true);
  };

  if (!updateInfo || isHidden) return null;

  return (
    <div className="ios-glass-overlay !z-[9999] p-4">
      <div className="ios-soft-card max-w-md w-full relative">
        {/* Top Glow Accent */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-purple-400 via-fuchsia-400 to-indigo-400" />
        
        {/* Header Section */}
        <div className="p-6 pb-4 flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-500/10 text-purple-600 rounded-2xl shadow-inner border border-purple-500/10">
              <Sparkles size={28} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">พบเวอร์ชันใหม่!</h3>
              <p className="text-[10px] font-extrabold text-purple-600 tracking-[0.15em] uppercase opacity-80">System Ready for Update</p>
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 hover:bg-white/50 p-2 rounded-full transition-all border border-transparent hover:border-white/40"
          >
            <X size={22} />
          </button>
        </div>

        {/* Content Section */}
        <div className="px-6 pb-8">
          <div className="ios-glass-pill p-4 mb-6 italic text-slate-600 text-sm leading-relaxed border-purple-500/5 bg-white/30">
            " แวะอัปเดตสักครู่ เพื่อการทำงานที่เสถียรยิ่งขึ้นและเห็นข้อมูลตรงกับทุกคนในทีม! "
          </div>

          <div className="space-y-3 mb-8 max-h-[180px] overflow-y-auto pr-2 custom-scrollbar">
            {updateInfo.changelog && updateInfo.changelog.length > 0 ? (
              updateInfo.changelog.map((log, i) => (
                <div key={i} className="flex gap-3 text-[15px] text-slate-700 items-start">
                  <div className="mt-1 w-5 h-5 flex items-center justify-center bg-green-500/10 rounded-full shrink-0">
                    <CheckCircle2 className="text-green-600" size={14} />
                  </div>
                  <span className="font-medium tracking-wide">{log}</span>
                </div>
              ))
            ) : (
              <div className="flex gap-3 text-[15px] text-slate-700 items-start">
                <div className="mt-1 w-5 h-5 flex items-center justify-center bg-green-500/10 rounded-full shrink-0">
                  <CheckCircle2 className="text-green-600" size={14} />
                </div>
                <span className="font-medium tracking-wide">ปรับปรุงประสิทธิภาพและความเสถียรของระบบ</span>
              </div>
            )}
          </div>

          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className={`w-full py-4 px-6 ios-glass-btn flex items-center justify-center gap-3 font-black text-lg transition-all ${
              isUpdating ? 'opacity-50 grayscale cursor-not-allowed' : ''
            }`}
          >
            {isUpdating ? (
              <>
                <RefreshCw size={22} className="animate-spin" />
                กำลังอัปเดต...
              </>
            ) : (
              <>
                <RefreshCw size={22} />
                อัปเดตระบบเลย
              </>
            )}
          </button>
          
          <div className="flex justify-center items-center gap-2 mt-6">
            <span className="h-[1px] w-4 bg-slate-200" />
            <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold">
              ID: {updateInfo.timestamp}
            </p>
            <span className="h-[1px] w-4 bg-slate-200" />
          </div>
        </div>
      </div>
    </div>
  );
};
