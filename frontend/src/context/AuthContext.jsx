import React, { createContext, useContext, useState } from 'react';
import { apiService } from '../services/api';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

// Simple XOR obfuscation key – not cryptographic but hides plaintext from casual inspection
const STORAGE_KEY = 'dw_session';
const SECRET = 'DWS!@#2025';

function obfuscate(str) {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    result += String.fromCharCode(str.charCodeAt(i) ^ SECRET.charCodeAt(i % SECRET.length));
  }
  return btoa(result);
}

function deobfuscate(encoded) {
  try {
    const str = atob(encoded);
    let result = '';
    for (let i = 0; i < str.length; i++) {
      result += String.fromCharCode(str.charCodeAt(i) ^ SECRET.charCodeAt(i % SECRET.length));
    }
    return result;
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

  React.useEffect(() => {
    if (user) {
      // Pass user ID + name so backend gets proper executorId (ID) not name
      apiService.setUserSession(
        user.ID || user.id,
        user.Name || user.name || user.Username
      );
    } else {
      apiService.setUserSession(null, 'System');
    }
  }, [user]);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const userData = await apiService.login(username, password);
      setUser(userData);
      saveSession(userData);
      return userData;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('user');
  };

  const updateUserState = (newData) => {
    const updatedUser = { ...user, ...newData };
    setUser(updatedUser);
    saveSession(updatedUser);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUserState, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
