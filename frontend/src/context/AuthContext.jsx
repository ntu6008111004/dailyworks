import React, { createContext, useContext, useState, useCallback } from 'react';
import { apiService } from '../services/api';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

// Simple XOR obfuscation key – not cryptographic but hides plaintext from casual inspection
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

function saveSession(userData) {
  const encoded = obfuscate(JSON.stringify(userData));
  localStorage.setItem(STORAGE_KEY, encoded);
}

function loadSession() {
  // Support old plaintext sessions for backward compatibility
  const encoded = localStorage.getItem(STORAGE_KEY);
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
  }, [user?.ID, user?.id, user?.Username, refreshInitData]);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const userData = await apiService.login(username, password);
      setUser(userData);
      saveSession(userData);
      // Data will be refreshed by useEffect hook due to user change
      return userData;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setPositions([]);
    setDepartments([]);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('user');
  };

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
      getPositionColor
    }}>
      {children}
    </AuthContext.Provider>
  );
};
