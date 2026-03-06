import React, { createContext, useContext, useState } from 'react';
import { apiService } from '../services/api';

const AuthContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (user) {
      apiService.setExecutor(user.Name || user.name || user.Username);
    } else {
      apiService.setExecutor('System');
    }
  }, [user]);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const userData = await apiService.login(username, password);
      // setExecutor will be handled by useEffect
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      return userData;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  const updateUserState = (newData) => {
    const updatedUser = { ...user, ...newData };
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUserState, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
