import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Sparkles, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  UPDATE_ATTEMPT_KEY,
  updateGateDecision,
} from '../utils/updateGate';

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
  const lastCheckTime = useRef(0);
  const checkInterval = useRef(null);
  const isNavigating = useRef(false);

  const clearOldCaches = useCallback(async () => {
    if (!('caches' in window)) return;
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    } catch (error) {
      console.error('Cache clear failed', error);
    }
  }, []);

  const rememberAttemptedVersion = useCallback((serverVersion) => {
    try {
      localStorage.setItem(UPDATE_ATTEMPT_KEY, String(serverVersion));
      localStorage.removeItem('notified_stale_update');
    } catch {
      // sessionStorage is a fallback for browsers that block persistent data.
      sessionStorage.setItem(UPDATE_ATTEMPT_KEY, String(serverVersion));
    }
  }, []);

  const reloadForVersion = useCallback(async (serverVersion) => {
    if (isNavigating.current) return;
    isNavigating.current = true;
    rememberAttemptedVersion(serverVersion);
    await clearOldCaches();
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('v', String(serverVersion));
    window.location.replace(nextUrl.toString());
  }, [clearOldCaches, rememberAttemptedVersion]);

  const checkForUpdates = useCallback(async () => {
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
      
      let attemptedVersion = '';
      try {
        attemptedVersion = localStorage.getItem(UPDATE_ATTEMPT_KEY)
          || sessionStorage.getItem(UPDATE_ATTEMPT_KEY)
          || '';
      } catch {
        attemptedVersion = sessionStorage.getItem(UPDATE_ATTEMPT_KEY) || '';
      }
      const decision = updateGateDecision({
        currentVersion: CURRENT_VERSION,
        serverVersion,
        attemptedVersion,
      });

      if (decision === 'none') {
        // The new bundle is active. Clear the acknowledgement so a genuinely
        // newer server version can prompt normally in the future.
        try { localStorage.removeItem(UPDATE_ATTEMPT_KEY); } catch { /* no-op */ }
        sessionStorage.removeItem(UPDATE_ATTEMPT_KEY);
        return;
      }

      if (decision === 'acknowledged') {
        // The user already pressed update for this exact release on this
        // device. Never reopen the same mandatory popup, even if a PWA/CDN
        // still reports the previous bundle version for a short period.
        setUpdateInfo(null);
        return;
      }

      setUpdateInfo({ ...data, timestamp: serverVersion });
    } catch (err) {
      console.error('Failed to check for updates:', err);
    }
  }, []);

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
  }, [checkForUpdates]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    toast.success('กำลังเคลียร์ข้อมูลเก่าเพื่ออัปเดต...', { icon: '🧹', position: 'bottom-center' });
    
    const serverVersion = updateInfo.timestamp;
    // Persist before any async cache work so another focus/version check cannot
    // reopen this release while the navigation is still in progress.
    rememberAttemptedVersion(serverVersion);

    // Slight delay allows the confirmation toast to show.
    setTimeout(() => {
      reloadForVersion(serverVersion);
    }, 1500);
  };

  if (!updateInfo) return null;

  const changelog = Array.isArray(updateInfo.changelog) && updateInfo.changelog.length
    ? updateInfo.changelog.slice(0, 4)
    : ['ปรับปรุงประสิทธิภาพและความเสถียรของระบบ'];

  return (
    <div className="ios-glass-overlay !z-[9999] p-4" role="dialog" aria-modal="true" aria-label="จำเป็นต้องอัปเดตระบบ">
      <div className="ios-soft-card w-full max-w-md overflow-hidden">
        {/* Top Glow Accent */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-purple-400 via-fuchsia-400 to-indigo-400" />
        
        {/* Header Section */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-violet-100 to-fuchsia-100 text-violet-600 rounded-2xl border border-violet-200/70 shadow-sm">
              <Sparkles size={25} />
            </div>
            <div>
              <p className="text-xs font-bold text-violet-600 mb-0.5">มีอัปเดตใหม่พร้อมใช้งาน</p>
              <h3 className="text-xl font-black text-slate-800 tracking-tight leading-tight">จำเป็นต้องอัปเดตระบบ</h3>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="px-5 pb-5">
          <div className="rounded-xl bg-violet-50 border border-violet-100 px-3 py-2.5 mb-3">
            <p className="text-sm font-semibold text-slate-700">อัปเดตนี้มีรายการใหม่ {changelog.length} รายการ</p>
              <p className="text-xs text-slate-500 mt-0.5">กรุณาอัปเดตก่อนใช้งานต่อ</p>
          </div>

          <div className="space-y-2.5 mb-4" aria-label="รายการอัปเดตใหม่">
            {changelog.map((log, i) => (
              <article key={i} className="flex gap-2.5 rounded-xl border border-slate-100 bg-white/70 px-3 py-2.5 shadow-sm">
                <div className="w-6 h-6 flex items-center justify-center bg-emerald-50 rounded-full shrink-0 mt-0.5">
                  <CheckCircle2 className="text-emerald-600" size={15} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm leading-5 text-slate-700 font-medium break-words">{log}</p>
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
          
          <p className="text-center text-[11px] text-slate-400 mt-3">เผยแพร่เมื่อ {formatPublishedAt(updateInfo.timestamp)}</p>
        </div>
      </div>
    </div>
  );
};
