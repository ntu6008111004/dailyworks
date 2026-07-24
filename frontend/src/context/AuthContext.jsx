import React, { createContext, useContext, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { apiService } from '../services/api';
import { thaiLlmService } from '../services/thaiLlmService';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

const STORAGE_KEY = 'dw_session';
const SECRET = 'DWS!@#2025';

function obfuscate(str) {
  // Use encodeURIComponent to handle Unicode (Thai, etc.), then btoa
  const encoded = btoa(unescape(encodeURIComponent(str)));
  // Rotate characters by key length as lightweight obfuscation
  const keyLen = SECRET.length;
  return encoded.split('').map((c, i) => {
    const code = c.charCodeAt(0) ^ (SECRET.charCodeAt(i % keyLen) & 0x1F);
    return String.fromCharCode(code);
  }).join('');
}

function deobfuscate(encoded) {
  try {
    const keyLen = SECRET.length;
    const reversed = encoded.split('').map((c, i) => {
      const code = c.charCodeAt(0) ^ (SECRET.charCodeAt(i % keyLen) & 0x1F);
      return String.fromCharCode(code);
    }).join('');
    return decodeURIComponent(escape(atob(reversed)));
  } catch {
    return null;
  }
}

// Add Cookie utility functions
function setCookie(name, value, days) {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax" + secureFlag;
}

function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i].trim();
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function eraseCookie(name) {
  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax' + secureFlag;
}

function saveSession(userData, remember = true) {
  const encoded = obfuscate(JSON.stringify(userData));
  localStorage.setItem(STORAGE_KEY, encoded);
  
  const shouldRemember = remember && localStorage.getItem('dw_remember') !== 'false';
  if (shouldRemember) {
    setCookie(STORAGE_KEY, encoded, 365);
  } else {
    setCookie(STORAGE_KEY, encoded, null);
  }
}

function loadSession() {
  let encoded = localStorage.getItem(STORAGE_KEY);
  
  if (!encoded) {
    encoded = getCookie(STORAGE_KEY);
    if (encoded) {
      localStorage.setItem(STORAGE_KEY, encoded);
    }
  } else {
    if (!getCookie(STORAGE_KEY) && localStorage.getItem('dw_remember') !== 'false') {
      setCookie(STORAGE_KEY, encoded, 365);
    }
  }

  if (encoded) {
    const decoded = deobfuscate(encoded);
    if (decoded) return JSON.parse(decoded);
  }
  // Fallback: check old key
  const legacy = localStorage.getItem('user');
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy);
      // Migrate to new key
      saveSession(parsed);
      localStorage.removeItem('user');
      return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => loadSession());
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [aiSessionReady, setAiSessionReady] = useState(() => thaiLlmService.getSessionStatus().valid);

  // Helper to get position name by ID
  const getPositionName = useCallback((id) => {
    if (!id) return '';
    const idStr = String(id);
    const pos = positions.find(p => String(p.ID) === idStr);
    return pos ? pos.Name : id;
  }, [positions]);

  // Helper to get position color by ID
  const getPositionColor = useCallback((id) => {
    if (!id) return '';
    const idStr = String(id);
    const pos = positions.find(p => String(p.ID) === idStr);
    
    if (pos?.Color) return pos.Color;
    
    const name = pos?.Name || '';
    if (name.includes('Admin')) return 'bg-red-100 text-red-600';
    if (name.includes('Manager') || name.includes('หัวหน้า')) return 'bg-purple-100 text-purple-600';
    if (name.includes('Staff') || name.includes('พนักงาน')) return 'bg-blue-100 text-blue-600';
    return 'bg-blue-50 text-blue-500';
  }, [positions]);

  const refreshInitData = useCallback(async (targetId) => {
    if (!targetId && !isInitializing) return;
    
    try {
      const data = await apiService.getInitData(targetId);
      if (data.positions) setPositions(data.positions);
      if (data.departments) setDepartments(data.departments);
      if (data.currentUser) {
        // Use a functional update to avoid dependency on 'user'
        setUser(prev => {
          const updated = { ...prev, ...data.currentUser };
          if (JSON.stringify(updated) !== JSON.stringify(prev)) {
            saveSession(updated);
            return updated;
          }
          return prev;
        });
      }
    } catch (error) {
      console.error('Failed to fetch init data:', error);
    } finally {
      setIsInitializing(false);
    }
  }, [isInitializing]); // Removed 'user' to break the loop

  React.useEffect(() => {
    const userId = user?.ID || user?.id;
    refreshInitData(userId);
    
    if (user) {
      apiService.setUserSession(
        user.ID || user.id,
        user.Name || user.name || user.Username
      );
    } else {
      apiService.setUserSession(null, 'System');
    }
    // Only re-run when actual identity fields change, not the whole user object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.ID, user?.id, user?.Username, user?.Name, user?.name, refreshInitData]);

  const login = async (username, password, remember = true) => {
    setLoading(true);
    try {
      const userData = await apiService.login(username, password);
      try {
        await thaiLlmService.createSession(username, password);
        const verifiedAiSession = thaiLlmService.getSessionStatus();
        if (!verifiedAiSession.valid) {
          const sessionError = new Error('AI session token could not be verified');
          sessionError.code = `session_${verifiedAiSession.reason}`;
          throw sessionError;
        }
        toast.dismiss('catlog-ai-session-unavailable');
        setAiSessionReady(true);
      } catch (error) {
        console.warn('AI session could not be created:', error);
        thaiLlmService.clearSession();
        setAiSessionReady(false);
      }
      const sessionUserData = { ...userData, _u: username, _p: password };
      setUser(sessionUserData);
      localStorage.setItem('dw_remember', remember ? 'true' : 'false');
      saveSession(sessionUserData, remember);
      // Data will be refreshed by useEffect hook due to user change
      return userData;
    } finally {
      setLoading(false);
    }
  };

  const logout = useCallback(() => {
    thaiLlmService.clearSession();
    setAiSessionReady(false);
    setUser(null);
    setPositions([]);
    setDepartments([]);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('user');
    localStorage.removeItem('dw_remember');
    // Remove unowned legacy chat keys. New chat storage is namespaced by user ID.
    localStorage.removeItem('chatbot_rooms');
    localStorage.removeItem('chatbot_active_room');
    localStorage.removeItem('chatbot_mini_messages');
    eraseCookie(STORAGE_KEY);
  }, []);

  React.useEffect(() => {
    if (!user) return undefined;

    let isMounted = true;
    let aiExpiryTimer;

    const checkAndRenewSession = async () => {
      const session = thaiLlmService.getSessionStatus();
      if (session.valid) {
        if (isMounted) setAiSessionReady(true);
        const existingToken = thaiLlmService.getSessionToken();
        const userId = user?.ID || user?.id;
        if (existingToken && userId) {
          thaiLlmService.setSessionToken(existingToken, userId);
        }
        const remainingMs = session.expiresAt - Date.now();
        // Schedule auto-renewal 1 minute before expiration
        const renewDelay = Math.max(1000, remainingMs - 60000);
        aiExpiryTimer = window.setTimeout(async () => {
          if (!isMounted) return;
          await thaiLlmService.autoRenewSession(user);
          if (isMounted) {
            const renewedStatus = thaiLlmService.getSessionStatus();
            setAiSessionReady(renewedStatus.valid);
          }
        }, renewDelay);
        return;
      }

      // Session is missing, expired, or invalid.
      // Auto-renew seamlessly in background for active logged in WorkLogs user.
      try {
        await thaiLlmService.autoRenewSession(user);
        const renewedStatus = thaiLlmService.getSessionStatus();
        if (renewedStatus.valid && isMounted) {
          toast.dismiss('catlog-ai-session-unavailable');
          setAiSessionReady(true);
          return;
        }
      } catch (err) {
        console.warn('Auto AI session renewal failed on load:', err);
      }

      if (isMounted) {
        setAiSessionReady(false);
      }
    };

    checkAndRenewSession();

    const handleExpired = async () => {
      try {
        await thaiLlmService.autoRenewSession(user);
        const renewedStatus = thaiLlmService.getSessionStatus();
        if (renewedStatus.valid && isMounted) {
          toast.dismiss('catlog-ai-session-unavailable');
          setAiSessionReady(true);
          return;
        }
      } catch {}
      if (isMounted) setAiSessionReady(false);
    };

    window.addEventListener('catlog-ai-session-expired', handleExpired);

    return () => {
      isMounted = false;
      if (aiExpiryTimer) window.clearTimeout(aiExpiryTimer);
      window.removeEventListener('catlog-ai-session-expired', handleExpired);
    };
  }, [user]);

  const updateUserState = (newData) => {
    const updatedUser = { ...user, ...newData };
    setUser(updatedUser);
    saveSession(updatedUser);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      updateUserState, 
      loading, 
      positions, 
      departments, 
      getPositionName,
      refreshInitData,
      isInitializing,
      getPositionColor,
      aiSessionReady
    }}>
      {children}
    </AuthContext.Provider>
  );
};
