import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Dashboard } from './views/Dashboard';
import { Tasks } from './views/Tasks';
import { Timeline } from './views/Timeline';
import { AdminUsers } from './views/AdminUsers';
import { AdminMasterData } from './views/AdminMasterData';
import { AdminRoles } from './views/AdminRoles';
import { MyProfile } from './views/MyProfile';
import { MyTeam } from './views/MyTeam';
import { Briefing } from './views/Briefing';
import { Login } from './views/Login';
import { Unauthorized } from './views/Unauthorized';
import { Toaster } from 'react-hot-toast';

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="timeline" element={<Timeline />} />
            <Route path="briefing" element={<Briefing />} />
            <Route path="profile" element={<MyProfile />} />
            <Route path="team" element={<MyTeam />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="admin/masterdata" element={<AdminMasterData />} />
            <Route path="admin/roles" element={<AdminRoles />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
    </AuthProvider>
  );
}

export default App;
