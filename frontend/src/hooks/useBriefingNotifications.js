import { useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { apiService, supabase } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { shouldShowBriefingNotification } from '../utils/briefingRealtime';

const toAssigneeList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
};

// A single Realtime subscription replaces the old 60-second full-list poll.
// A lightweight focus reconciliation remains only for a tab that was asleep
// or temporarily disconnected from the WebSocket.
export const useBriefingNotifications = () => {
  const { user } = useAuth();
  const knownUpdates = useRef({});
  const usersById = useRef(new Map());
  const lastFocusCheck = useRef(0);

  const refreshUsers = useCallback(async () => {
    const people = await apiService.getUsers({ includeImage: false });
    usersById.current = new Map((people || []).map((person) => [String(person.ID), person]));
    return usersById.current;
  }, []);

  const isRelevant = useCallback(async (briefing) => {
    if (String(briefing.CreatorID) === String(user?.ID)) return true;
    if (toAssigneeList(briefing.Assignees).some((id) => String(id) === String(user?.ID))) return true;
    if (user?.Role !== 'Head') return false;
    if (!usersById.current.size) await refreshUsers();
    return usersById.current.get(String(briefing.CreatorID))?.Department === user?.Department;
  }, [refreshUsers, user?.Department, user?.ID, user?.Role]);

  const announce = useCallback(async (briefing, previousUpdatedAt) => {
    if (!briefing || !await isRelevant(briefing)) return;
    const updatedAt = new Date(briefing.UpdatedAt || briefing.CreatedAt || Date.now()).getTime();
    const id = String(briefing.ID);
    if (previousUpdatedAt === undefined) {
      knownUpdates.current[id] = updatedAt;
      return;
    }
    if (updatedAt <= (knownUpdates.current[id] || 0)) return;
    knownUpdates.current[id] = updatedAt;
    window.dispatchEvent(new CustomEvent('remote-briefing-update', {
      detail: { eventType: 'UPDATE', briefing },
    }));
    // A second tab with the same account must still update its UI immediately.
    // Suppress only the toast/OS notification for the user's own change.
    if (!shouldShowBriefingNotification({ lastUpdatedBy: briefing.LastUpdatedBy, userId: user?.ID })) return;

    const isReview = briefing.Status === 'ส่งตรวจ';
    const title = isReview ? 'มีงานรอตรวจ' : 'บรีฟงานมีการอัปเดต';
    const body = isReview
      ? `บรีฟ #${briefing.RunningID || ''} ถูกส่งเข้าตรวจแล้ว`
      : `บรีฟ #${briefing.RunningID || ''} เปลี่ยนสถานะเป็น ${briefing.Status || 'อัปเดตใหม่'}`;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico', tag: `briefing-${id}` });
    }
    toast.success(`${title}: ${body}`, { duration: 6000, position: 'bottom-right' });
  }, [isRelevant, user?.ID]);

  useEffect(() => {
    if (!user?.ID || !supabase?.channel) return undefined;
    let mounted = true;

    // A one-off baseline has no user-facing notification. It prevents a stale
    // event from being reported as new immediately after opening the app.
    apiService.getBriefingsNoCache()
      .then((items) => Promise.all((items || []).map((item) => announce(item, undefined))))
      .catch((error) => console.warn('[Briefing realtime] initial baseline failed', error));

    const channel = supabase
      .channel(`briefing-notifications:${user.ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Briefings' }, (payload) => {
        if (!mounted) return;
        if (payload.eventType === 'DELETE') {
          window.dispatchEvent(new CustomEvent('remote-briefing-update', {
            detail: { eventType: 'DELETE', briefing: payload.old },
          }));
          return;
        }
        announce(payload.new, knownUpdates.current[String(payload.new?.ID)] ?? 0).catch((error) => console.warn('[Briefing realtime] notification failed', error));
      })
      .subscribe();

    const reconcileOnFocus = async () => {
      if (document.hidden || Date.now() - lastFocusCheck.current < 5 * 60 * 1000) return;
      lastFocusCheck.current = Date.now();
      try {
        const items = await apiService.getBriefingsNoCache();
        if (mounted) await Promise.all((items || []).map((item) => announce(item, knownUpdates.current[String(item.ID)] ?? 0)));
      } catch (error) {
        console.warn('[Briefing realtime] focus reconciliation failed', error);
      }
    };
    window.addEventListener('focus', reconcileOnFocus);

    return () => {
      mounted = false;
      window.removeEventListener('focus', reconcileOnFocus);
      supabase.removeChannel(channel);
    };
  }, [announce, user?.ID]);
};
