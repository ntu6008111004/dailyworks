import React, { useState, useEffect } from 'react';
import { ShieldCheck, Save, RefreshCw } from 'lucide-react';
import { apiService } from '../services/api';
import { LoadingModal } from '../components/LoadingModal';
import toast from 'react-hot-toast';

const DEFAULT_PERMISSIONS = {
  showDailySummary: true,
  showMonthlySummary: true,
  showFullTaskDetail: true,
};

const PERMISSION_LABELS = [
  {
    key: 'showDailySummary',
    label: 'แสดงปุ่ม "สรุปงานวันนี้"',
    desc: 'ปุ่มสรุปงานประจำวันในหน้า Tasks',
    color: 'indigo',
  },
  {
    key: 'showMonthlySummary',
    label: 'แสดงปุ่ม "สรุปรายเดือน"',
    desc: 'ปุ่มสรุปงานรายเดือนในหน้า Tasks',
    color: 'sky',
  },
  {
    key: 'showFullTaskDetail',
    label: 'แสดงรายละเอียดงานครบถ้วน',
    desc: 'ถ้าปิด → แสดงเฉพาะชื่อโปรเจค/หัวข้อ ไม่แสดง Custom Fields',
    color: 'emerald',
  },
];

const colorMap = {
  indigo: {
    checked: 'bg-indigo-600 border-indigo-600',
    ring: 'ring-indigo-300',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  sky: {
    checked: 'bg-sky-600 border-sky-600',
    ring: 'ring-sky-300',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  emerald: {
    checked: 'bg-emerald-600 border-emerald-600',
    ring: 'ring-emerald-300',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
};

export const AdminRoles = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({}); // { [userId]: bool }

  useEffect(() => {
    (async () => {
      try {
        await apiService.migrateUsersAddPermissions();
      } catch (err) {
        console.error('Migration failed:', err);
      }
      fetchUsers();
    })();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await apiService.getUsers();
      setUsers(data || []);
    } catch {
      toast.error('ไม่สามารถดึงข้อมูลผู้ใช้ได้');
    } finally {
      setLoading(false);
    }
  };

  const getPermissions = (u) => {
    if (u.Permissions && typeof u.Permissions === 'object') {
      return { ...DEFAULT_PERMISSIONS, ...u.Permissions };
    }
    return { ...DEFAULT_PERMISSIONS };
  };

  const togglePermission = (userId, key) => {
    setUsers(prev =>
      prev.map(u => {
        if (u.ID !== userId) return u;
        const cur = getPermissions(u);
        const updated = { ...cur, [key]: !cur[key] };
        return { ...u, Permissions: updated };
      })
    );
  };

  const handleSaveUser = async (u) => {
    setSaving(prev => ({ ...prev, [u.ID]: true }));
    try {
      await apiService.updateUserPermissions(u.ID, getPermissions(u));
      toast.success(`บันทึกสิทธิ์ของ ${u.Name} เรียบร้อย`);
    } catch (err) {
      toast.error('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSaving(prev => ({ ...prev, [u.ID]: false }));
    }
  };

  const roleColors = {
    Admin: 'bg-red-100 text-red-700 border border-red-200',
    Head: 'bg-orange-100 text-orange-700 border border-orange-200',
    Staff: 'bg-blue-100 text-blue-700 border border-blue-200',
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <LoadingModal isOpen={loading} message="กำลังโหลดข้อมูลสิทธิ์การใช้งาน..." />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck size={26} className="text-emerald-600" />
            Role Management — สิทธิ์การใช้งาน
          </h2>
          <p className="text-slate-500">กำหนดสิทธิ์การเข้าถึงฟีเจอร์ต่างๆ ของแต่ละบัญชีผู้ใช้</p>
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-all"
        >
          <RefreshCw size={18} />
          <span className="hidden sm:inline">รีเฟรช</span>
        </button>
      </div>

      {/* Legend */}
      <div className="glass p-4 rounded-2xl flex flex-wrap gap-3 text-sm text-slate-600 border border-slate-200/60">
        <span className="font-semibold text-slate-700">คำอธิบายสิทธิ์:</span>
        {PERMISSION_LABELS.map(p => (
          <span key={p.key} className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${colorMap[p.color].badge}`}>
            {p.label}
          </span>
        ))}
      </div>

      {/* User Permission Cards */}
      <div className="space-y-3">
        {users.map(u => {
          const perms = getPermissions(u);
          const isSaving = saving[u.ID];
          return (
            <div key={u.ID} className="glass rounded-2xl border border-slate-200/60 p-5 hover:shadow-md transition-shadow">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                {/* User Info */}
                <div className="flex items-center gap-3 md:w-56 shrink-0">
                  {u.ProfileImage ? (
                    <img src={u.ProfileImage} alt={u.Name} className="w-10 h-10 rounded-full object-cover border-2 border-slate-100 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm shrink-0">
                      {u.Name?.charAt(0)?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 text-sm truncate">{u.Name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${roleColors[u.Role] || roleColors.Staff}`}>
                        {u.Role}
                      </span>
                      {u.Department && (
                        <span className="text-xs text-slate-400">{u.Department}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Permission Checkboxes */}
                <div className="flex flex-wrap gap-4 flex-1">
                  {PERMISSION_LABELS.map(p => {
                    const checked = perms[p.key];
                    const col = colorMap[p.color];
                    return (
                      <label
                        key={p.key}
                        className="flex items-start gap-2.5 cursor-pointer group select-none"
                      >
                        <div className="relative mt-0.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePermission(u.ID, p.key)}
                            className="sr-only"
                          />
                          <div
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                              checked
                                ? `${col.checked} shadow-sm`
                                : 'border-slate-300 bg-white group-hover:border-slate-400'
                            }`}
                          >
                            {checked && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-700 leading-tight">{p.label}</div>
                          <div className="text-xs text-slate-400 leading-tight mt-0.5">{p.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Save Button */}
                <button
                  onClick={() => handleSaveUser(u)}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors text-sm shrink-0 self-center md:self-auto"
                >
                  {isSaving ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  บันทึก
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && users.length === 0 && (
        <div className="glass p-12 text-center rounded-2xl text-slate-400">
          ไม่พบข้อมูลผู้ใช้
        </div>
      )}
    </div>
  );
};
