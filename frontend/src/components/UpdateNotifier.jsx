import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, X, Sparkles, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

// The build time injected version
/* global __APP_VERSION__ */
const CURRENT_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 0;

function formatPublishedAt(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return 'เพิ่งเผยแพร่';
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export const UpdateNotifier = () => {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const lastCheckTime = useRef(0);
  const checkInterval = useRef(null);

  const checkForUpdates = async () => {
    // Throttle checks to at most once every 10 minutes
    if (Date.now() - lastCheckTime.current < 10 * 60 * 1000) {
      return;
    }
    lastCheckTime.current = Date.now();

    try {
      // Use standard no-cache fetch so CDN / ETag handles verification efficiently
      const res = await fetch('/version.json', { cache: 'no-cache' });
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
    setTimeout(() => {
      lastCheckTime.current = 0; // Force first check
      checkForUpdates();
    }, 5000);
    
    // Check every 30 minutes
    checkInterval.current = setInterval(checkForUpdates, 30 * 60 * 1000);
    
    const handleFocus = () => {
      // Check on focus if last check was more than 15 minutes ago
      if (Date.now() - lastCheckTime.current > 15 * 60 * 1000) {
        checkForUpdates();
      }
    };

    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(checkInterval.current);
      window.removeEventListener('focus', handleFocus);
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

  const changelog = Array.isArray(updateInfo.changelog) && updateInfo.changelog.length
    ? updateInfo.changelog
    : ['ปรับปรุงประสิทธิภาพและความเสถียรของระบบ'];

  return (
    <div className="ios-glass-overlay !z-[9999] p-4">
      <div className="ios-soft-card max-w-lg w-full relative max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        {/* Top Glow Accent */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-purple-400 via-fuchsia-400 to-indigo-400" />
        
        {/* Header Section */}
        <div className="px-6 pt-6 pb-5 flex justify-between items-start shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-violet-100 to-fuchsia-100 text-violet-600 rounded-2xl border border-violet-200/70 shadow-sm">
              <Sparkles size={25} />
            </div>
            <div>
              <p className="text-xs font-bold text-violet-600 mb-0.5">มีอัปเดตใหม่พร้อมใช้งาน</p>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">อัปเดตระบบ</h3>
            </div>
          </div>
          <button 
            onClick={handleDismiss}
            aria-label="ปิดการแจ้งเตือนอัปเดต"
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Section */}
        <div className="px-6 pb-6 min-h-0 flex flex-col">
          <div className="rounded-2xl bg-violet-50 border border-violet-100 px-4 py-3 mb-4 shrink-0">
            <p className="text-sm font-semibold text-slate-700">อัปเดตครั้งนี้มี {changelog.length} รายการ</p>
            <p className="text-xs text-slate-500 mt-0.5">กดอัปเดตเพื่อโหลดข้อมูลและหน้าจอเวอร์ชันล่าสุด</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-3 mb-5" aria-label="รายการอัปเดต">
            {changelog.map((log, i) => (
              <article key={i} className="flex gap-3 rounded-2xl border border-slate-100 bg-white/70 px-4 py-3.5 shadow-sm">
                <div className="w-7 h-7 flex items-center justify-center bg-emerald-50 rounded-full shrink-0 mt-0.5">
                  <CheckCircle2 className="text-emerald-600" size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-400 mb-1">รายการที่ {i + 1}</p>
                  <p className="text-[15px] leading-6 text-slate-700 font-medium break-words">{log}</p>
                </div>
              </article>
            ))}
          </div>

          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className={`w-full py-3.5 px-6 ios-glass-btn flex items-center justify-center gap-3 font-black text-base transition-all shrink-0 ${
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
          
          <p className="text-center text-[11px] text-slate-400 mt-4">เผยแพร่เมื่อ {formatPublishedAt(updateInfo.timestamp)}</p>
        </div>
      </div>
    </div>
  );
};
