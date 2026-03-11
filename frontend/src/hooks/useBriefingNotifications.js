import { useEffect, useRef } from 'react';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export const useBriefingNotifications = () => {
  const { user } = useAuth();
  const lastUpdateRef = useRef({}); // Store max UpdatedAt for each briefing
  const isInitializedRef = useRef(false);

  useEffect(() => {
    // Request permission once
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!user?.ID) return;

    let isMounted = true;
    let timeoutId = null;
    const pollBriefings = async () => {
      try {
        const briefings = await apiService.getBriefingsNoCache();
        if (!isMounted) return;

        // Make sure it's an array
        if (!Array.isArray(briefings)) {
          return;
        }

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
              if (Notification.permission === 'granted') {
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
        console.error('[Polling] Error in briefing poller:', error);
      } finally {
        if (isMounted) {
          timeoutId = setTimeout(pollBriefings, 30000); // Poll every 30 seconds
        }
      }
    };

    // Delay first poll slightly to not block initial render queries too much
    timeoutId = setTimeout(pollBriefings, 5000);

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [user?.ID]);
};
