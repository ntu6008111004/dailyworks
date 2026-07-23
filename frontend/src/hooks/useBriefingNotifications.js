import { useEffect, useRef } from 'react';
import { apiService, supabase } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export const useBriefingNotifications = () => {
  const { user } = useAuth();
  const lastUpdateRef = useRef({}); // Store max UpdatedAt for each briefing
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (!user?.ID) return;

    let isMounted = true;
    let timeoutId = null;
    let lastPollTime = 0;

    const pollBriefings = async () => {
      try {
        lastPollTime = Date.now();
        const briefings = await apiService.getBriefingsNoCache();
        if (!isMounted || !Array.isArray(briefings)) return;

        const incomingUpdates = {};
        let hasUpdates = false;

        briefings.forEach(briefing => {
          const isCreator = String(briefing.CreatorID) === String(user.ID);
          const isAssignee = briefing.Assignees?.some(id => String(id) === String(user.ID));
          
          if (!isCreator && !isAssignee) return; // Not involved

          const updatedAt = new Date(briefing.UpdatedAt || briefing.CreatedAt).getTime();
          incomingUpdates[briefing.ID] = updatedAt;

          // If this is not the first load, check if it's newly updated OR newly assigned
          const prevUpdate = lastUpdateRef.current[briefing.ID];
          
          if (isInitializedRef.current) {
            const isNew = !prevUpdate;
            const isModified = prevUpdate && updatedAt > prevUpdate;

            if ((isNew || isModified) && String(briefing.LastUpdatedBy) !== String(user.ID)) {
              
              const title = 'แจ้งเตือนบรีฟงาน';
              const body = `บรีฟงาน #${briefing.RunningID} มีการอัปเดต/มอบหมายใหม่`;

              // Trigger OS Notification if permitted
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(title, {
                  body: body,
                  icon: '/favicon.ico'
                });
              }

              // Also show toast in-app
              toast.success(`${title}\n${body}`, { duration: 6000, position: 'bottom-right' });
              
              hasUpdates = true;
            }
          }
        });

        // Check for deletions: If a briefing we previously tracked is now missing
        const prevIds = Object.keys(lastUpdateRef.current);
        const currentIds = Object.keys(incomingUpdates);
        const hasDeletions = prevIds.some(id => !currentIds.includes(id));
        
        if (hasDeletions) {
          hasUpdates = true;
        }

        // Update refs
        lastUpdateRef.current = incomingUpdates;
        isInitializedRef.current = true;

        if (hasUpdates) {
          window.dispatchEvent(new CustomEvent('remote-briefing-update'));
        }
      } catch (error) {
        console.error('[Notifications] Error in briefing poller:', error);
      }
    };

    // Initial check on mount
    pollBriefings();

    // 1. REALTIME WEBSOCKET: Subscribes directly to Supabase Postgres Changes
    // Zero Vercel Function Requests, 0ms Delay for Instant Push Notifications!
    let channel;
    try {
      if (supabase && typeof supabase.channel === 'function') {
        channel = supabase
          .channel(`briefing-notifications:${user.ID}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'Briefing' },
            () => {
              if (isMounted) pollBriefings();
            }
          )
          .subscribe();
      }
    } catch (err) {
      console.warn('[Realtime] Supabase subscription warning:', err);
    }

    // 2. ADAPTIVE POLLING FALLBACK: Polls every 60s when active (pauses when hidden)
    const scheduleNextPoll = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!document.hidden && isMounted) {
          pollBriefings();
        }
        if (isMounted) scheduleNextPoll();
      }, 60000);
    };
    scheduleNextPoll();

    // Instant check when user switches back to active tab
    const handleVisibilityChange = () => {
      if (!document.hidden && Date.now() - lastPollTime > 15000) {
        pollBriefings();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (channel && supabase && typeof supabase.removeChannel === 'function') {
        supabase.removeChannel(channel);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.ID]);
};
