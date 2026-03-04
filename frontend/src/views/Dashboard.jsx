import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AlertCircle, Activity, CheckCircle2, Clock } from 'lucide-react';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const Dashboard = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Mock data for initial render or fallback
  const mockTasks = [
    { ID: 1, StaffName: 'John Doe', Status: 'In Progress', Priority: 'High', DueDate: new Date(Date.now() - 86400000).toISOString() },
    { ID: 2, StaffName: 'Jane Smith', Status: 'Done', Priority: 'Medium', DueDate: new Date().toISOString() },
    { ID: 3, StaffName: 'John Doe', Status: 'Review', Priority: 'High', DueDate: new Date().toISOString() },
    { ID: 4, StaffName: 'Alice', Status: 'Not Started', Priority: 'Low', DueDate: new Date(Date.now() - 86400000 * 2).toISOString() },
  ];

  useEffect(() => {
    // In a real app, we'd fetch actual tasks. Using mock for UI demonstration.
    setTasks(mockTasks);
    setLoading(false);
  }, []);

  // Calculate stats
  const overdueTasks = tasks.filter(t => new Date(t.DueDate) < new Date() && t.Status !== 'Done');
  const doneTasks = tasks.filter(t => t.Status === 'Done');

  // Prepare heatmap data
  const workload = tasks.reduce((acc, task) => {
    if (!acc[task.StaffName]) acc[task.StaffName] = 0;
    acc[task.StaffName]++;
    return acc;
  }, {});
  
  const heatmapData = Object.keys(workload).map(name => ({
    name,
    tasks: workload[name]
  })).sort((a, b) => b.tasks - a.tasks);

  if (loading) return <div className="animate-pulse space-y-4 max-w-lg"><div className="h-8 bg-slate-200 rounded w-1/3"></div><div className="h-32 bg-slate-200 rounded"></div></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
          <p className="text-slate-500">Welcome back, {user?.name || 'User'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Stats Cards */}
        <div className="glass p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Tasks</p>
            <p className="text-2xl font-bold text-slate-900">{tasks.length}</p>
          </div>
        </div>
        
        <div className="glass p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-red-100 text-red-600 rounded-xl">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Overdue Tasks</p>
            <p className="text-2xl font-bold text-red-600">{overdueTasks.length}</p>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3 bg-green-100 text-green-600 rounded-xl">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Completed</p>
            <p className="text-2xl font-bold text-slate-900">{doneTasks.length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Workload Heatmap */}
        <div className="glass p-6 rounded-2xl shadow-sm border border-slate-200/60">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Workload Heatmap</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={heatmapData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '0.75rem', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Bar dataKey="tasks" radius={[4, 4, 0, 0]}>
                  {heatmapData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.tasks > 2 ? '#ef4444' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Overdue Alerts */}
        <div className="glass p-6 rounded-2xl shadow-sm border border-slate-200/60">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Clock className="text-red-500" size={20} />
            Overdue Alerts
          </h3>
          <div className="space-y-4">
            {overdueTasks.length === 0 ? (
              <p className="text-slate-500 text-center py-8">Great job! No overdue tasks.</p>
            ) : (
              overdueTasks.map(task => (
                <div key={task.ID} className="p-4 rounded-xl border border-red-200 bg-red-50 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-red-900">Task #{task.ID}</h4>
                    <p className="text-sm text-red-700">Assigned to: {task.StaffName}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      Late
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
