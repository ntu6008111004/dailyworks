import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './views/Login';
import { Unauthorized } from './views/Unauthorized';
import { Toaster } from 'react-hot-toast';
import { UpdateNotifier } from './components/UpdateNotifier';

// Each page is its own chunk so the login screen does not download the
// dashboard, charts and admin screens before it can render.
// A tab left open across a deploy still points at the old chunk names, which
// no longer exist; reload once to pick up the new build instead of crashing.
const RELOAD_FLAG = 'dw_chunk_reload';
const lazyPage = (load, name) => lazy(() => load()
  .then(m => {
    sessionStorage.removeItem(RELOAD_FLAG);
    return { default: m[name] };
  })
  .catch(error => {
    if (!sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
      return new Promise(() => {});
    }
    throw error;
  }));
const Layout = lazyPage(() => import('./components/Layout'), 'Layout');
const Dashboard = lazyPage(() => import('./views/Dashboard'), 'Dashboard');
const Tasks = lazyPage(() => import('./views/Tasks'), 'Tasks');
const Timeline = lazyPage(() => import('./views/Timeline'), 'Timeline');
const AdminUsers = lazyPage(() => import('./views/AdminUsers'), 'AdminUsers');
const AdminMasterData = lazyPage(() => import('./views/AdminMasterData'), 'AdminMasterData');
const AdminRoles = lazyPage(() => import('./views/AdminRoles'), 'AdminRoles');
const MyProfile = lazyPage(() => import('./views/MyProfile'), 'MyProfile');
const MyTeam = lazyPage(() => import('./views/MyTeam'), 'MyTeam');
const Briefing = lazyPage(() => import('./views/Briefing'), 'Briefing');
const BriefingReview = lazyPage(() => import('./views/BriefingReview'), 'BriefingReview');
const ChatbotWorklog = lazyPage(() => import('./views/ChatbotWorklog'), 'ChatbotWorklog');
const WorkReports = lazyPage(() => import('./views/WorkReports'), 'WorkReports');

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
  </div>
);

const ProtectedRoute = ({ children }) => {
  // During Vite Fast Refresh the context module can briefly be reloaded before
  // its provider tree. Do not crash the whole application in that transition.
  const auth = useAuth();
  const user = auth?.user;
  const location = useLocation();
  if (!user) {
    // Remember the page so a shared link (e.g. a report sent over LINE) opens
    // right after signing in instead of dropping the reader on the dashboard.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <UpdateNotifier />
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="timeline" element={<Timeline />} />
            <Route path="briefing" element={<Briefing />} />
            <Route path="briefing/review" element={<BriefingReview />} />
            <Route path="reports" element={<WorkReports />} />
            <Route path="reports/:reportId" element={<WorkReports />} />
            <Route path="chatbot" element={<ChatbotWorklog />} />
            <Route path="profile" element={<MyProfile />} />
            <Route path="team" element={<MyTeam />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="admin/masterdata" element={<AdminMasterData />} />
            <Route path="admin/roles" element={<AdminRoles />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster position="top-right" />
    </AuthProvider>
  );
}

export default App;
