import React, { useState, useEffect } from 'react';
import { Plus, Filter, Search, Edit2, Trash2, Calendar, LayoutList } from 'lucide-react';
import { TaskModal } from '../components/TaskModal';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';

export const Tasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Mock
  useEffect(() => {
    setTasks([
      {
        ID: '12345', Detail: 'Design new landing page',
        StartDate: new Date().toISOString(), DueDate: new Date(Date.now() + 86400000).toISOString(),
        Priority: 'High', Status: 'In Progress', StaffName: 'John Doe', CustomFields: { "color": "blue", "refUrl": "https://example.com" }
      }
    ]);
    setLoading(false);
  }, []);

  const handleSaveTask = (taskData) => {
    if (editingTask) {
      setTasks(tasks.map(t => t.ID === taskData.ID ? taskData : t));
    } else {
      setTasks([{ ...taskData, ID: Math.random().toString(), StaffName: user?.name || 'Self' }, ...tasks]);
    }
    setIsModalOpen(false);
  };

  const statusColors = {
    'Not Started': 'bg-slate-100 text-slate-800',
    'In Progress': 'bg-blue-100 text-blue-800',
    'Review': 'bg-purple-100 text-purple-800',
    'Edit': 'bg-amber-100 text-amber-800',
    'Done': 'bg-green-100 text-green-800',
  };

  const filteredTasks = tasks.filter(t => {
    if (filterStatus !== 'All' && t.Status !== filterStatus) return false;
    if (searchQuery && !t.Detail.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (user?.role === 'Staff' && t.StaffName !== user?.name) return false;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Task Management</h2>
          <p className="text-slate-500">Manage your daily work logs</p>
        </div>
        <button
          onClick={() => { setEditingTask(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-sm focus:ring-4 focus:ring-blue-100"
        >
          <Plus size={20} />
          <span>New Task</span>
        </button>
      </div>

      <div className="glass p-4 rounded-2xl flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <div className="sm:w-48 relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full pl-10 pr-8 py-2 border border-slate-200 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
          >
            <option value="All">All Status</option>
            {Object.keys(statusColors).map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {filteredTasks.length === 0 ? (
          <div className="glass p-12 text-center rounded-2xl">
            <LayoutList className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-2 text-sm font-semibold text-slate-900">No tasks found</h3>
            <p className="mt-1 text-sm text-slate-500">Get started by creating a new task.</p>
          </div>
        ) : (
          filteredTasks.map(task => (
            <div key={task.ID} className="glass p-5 rounded-2xl border border-slate-200/60 hover:shadow-md transition-shadow group flex flex-col md:flex-row gap-6">
              <div className="flex-1 space-y-3">
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-bold text-slate-900">{task.Detail}</h3>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${statusColors[task.Status]}`}>
                    {task.Status}
                  </span>
                </div>
                
                <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={16} />
                    <span>Due: {format(new Date(task.DueDate), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 rounded-md">
                    <span className="font-medium text-slate-700">{task.StaffName}</span>
                  </div>
                </div>

                {task.CustomFields && Object.keys(task.CustomFields).length > 0 && (
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                    {Object.entries(task.CustomFields).map(([key, value]) => (
                      <div key={key} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-blue-800">
                        <span className="font-semibold">{key}:</span> {value}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex md:flex-col gap-2 justify-end opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => { setEditingTask(task); setIsModalOpen(true); }}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Edit2 size={18} />
                </button>
                <button
                  onClick={() => setTasks(tasks.filter(t => t.ID !== task.ID))}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <TaskModal
          task={editingTask}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveTask}
        />
      )}
    </div>
  );
};
