import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, CalendarDays, LogOut, Menu, X, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';

export const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { name: 'หน้าภาพรวม', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'จัดการงาน', path: '/tasks', icon: <CheckSquare size={20} /> },
    { name: 'ไทม์ไลน์งาน', path: '/timeline', icon: <CalendarDays size={20} /> }
  ];

  if (user?.Role === 'Admin' || user?.role === 'Admin') {
    navItems.push({ name: 'จัดการผู้ใช้งาน', path: '/admin/users', icon: <Users size={20} /> });
  }

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 glass flex flex-col border-r border-slate-200 transform transition-transform duration-300 md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-slate-200/50 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
            WorkLogs
          </h1>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-3">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium ${
                  location.pathname === item.path
                    ? 'bg-blue-50 text-blue-600 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.icon}
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200/50">
          <div className="flex items-start gap-3 px-3 py-2 mb-2">
            {user?.ProfileImage ? (
              <img src={user.ProfileImage} alt={user.Name} className="w-10 h-10 rounded-full object-cover border border-slate-200" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg shrink-0">
                {(user?.Name || user?.name || user?.Username || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 leading-tight line-clamp-2 whitespace-normal break-words">
                {user?.Name || user?.name || user?.Username || 'ผู้ใช้งาน'}
              </p>
              <p className="text-[10px] font-medium px-2 py-0.5 mt-1 bg-slate-100 text-slate-600 rounded-md inline-block uppercase tracking-wider">
                {user?.Role || user?.role || 'Guest'} {user?.Department ? `(${user?.Department})` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut size={18} />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="glass md:hidden border-b border-slate-200 flex items-center justify-between p-4 z-10 sticky top-0">
          <h1 className="text-xl font-bold text-blue-600">WorkLogs</h1>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Menu size={24} />
          </button>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
