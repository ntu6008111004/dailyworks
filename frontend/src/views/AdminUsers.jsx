import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Users } from 'lucide-react';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';
import { LoadingModal } from '../components/LoadingModal';
import { CustomSelect } from '../components/CustomSelect';

export const AdminUsers = () => {
  const { user: currentUser, updateUserState } = useAuth();
  const [users, setUsers] = useState([]);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const [formData, setFormData] = useState({
    Username: '',
    Password: '',
    Role: 'Staff',
    Department: '',
    Name: '',
    Position: '',
    ProfileImage: ''
  });

  useEffect(() => {
    const init = async () => {
      try {
        await apiService.migrateUsersSheet();
        await apiService.migrateUsersAddPosition();
        const [_, posData] = await Promise.all([
          fetchUsers(),
          apiService.getPositions().catch(() => [])
        ]);
        setPositions(posData || []);
      } catch (err) {
        console.error('Migration failed:', err);
        fetchUsers();
        apiService.getPositions().then(d => setPositions(d || [])).catch(() => {});
      }
    };
    init();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await apiService.getUsers();
      setUsers(data);
    } catch {
      toast.error('ไม่สามารถดึงข้อมูลผู้ใช้ได้');
    } finally {
      setLoading(false);
    }
  };

  const compressProfileImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 150; // Small avatar size
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // Highly compressed WebP for profile pic (~10-30kb)
          resolve(canvas.toDataURL('image/webp', 0.5));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleOpenModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        ID: user.ID,
        Username: user.Username,
        Password: '', // Don't show existing hash
        Role: user.Role,
        Department: user.Department,
        Name: user.Name,
        Position: user.Position || '',
        ProfileImage: user.ProfileImage || ''
      });
    } else {
      setEditingUser(null);
      setFormData({ Username: '', Password: '', Role: 'Staff', Department: '', Name: '', Position: '', ProfileImage: '' });
    }
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingUser) {
        const updateData = { ...formData };
        if (!updateData.Password) {
          delete updateData.Password; // Let apiService handle absence
        }
        await apiService.updateUser(updateData);
        
        // Sync current user state if they updated themselves
        if (currentUser && currentUser.ID == updateData.ID) {
          updateUserState(updateData);
        }
        
        toast.success('อัปเดตผู้ใช้เรียบร้อย');
      } else {
        const newData = { ...formData };
        await apiService.addUser(newData);
        toast.success('เพิ่มผู้ใช้ใหม่เรียบร้อย');
      }
      setIsModalOpen(false);
      fetchUsers();
    } catch (error) {
      toast.error(error.message);
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirmId) return;
    setLoading(true);
    try {
      await apiService.deleteUser(deleteConfirmId);
      toast.success('ลบผู้ใช้เรียบร้อย');
      setDeleteConfirmId(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.message);
      setLoading(false);
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const compressed = await compressProfileImage(file);
      setFormData({ ...formData, ProfileImage: compressed });
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users size={28} className="text-blue-600" />
            จัดการผู้ใช้งาน
          </h2>
          <p className="text-slate-500">สำหรับผู้ดูแลระบบ (Admin) เท่านั้น</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-sm focus:ring-4 focus:ring-blue-100"
        >
          <Plus size={20} />
          <span>เพิ่มพนักงานใหม่</span>
        </button>
      </div>

      <div className="glass rounded-2xl overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">พนักงาน</th>
                <th className="px-6 py-4 font-semibold">ชื่อผู้ใช้ (Username)</th>
                <th className="px-6 py-4 font-semibold">แผนก</th>
                <th className="px-6 py-4 font-semibold">สิทธิ์</th>
                <th className="px-6 py-4 font-semibold text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {users.map(u => (
                <tr key={u.ID} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {u.ProfileImage ? (
                        <img src={u.ProfileImage} alt={u.Name} className="w-8 h-8 rounded-full object-cover border border-slate-200" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                          {u.Name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="font-medium text-slate-900">{u.Name}</div>
                    </div>
                  </td>                  <td className="px-6 py-4 text-slate-500">{u.Username}</td>
                  <td className="px-6 py-4">{u.Department}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                      u.Role === 'Admin' ? 'bg-red-100 text-red-700 border border-red-200' :
                      u.Role === 'Head' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                      'bg-blue-100 text-blue-700 border border-blue-200'
                    }`}>
                      {u.Role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => handleOpenModal(u)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit2 size={18} />
                    </button>
                    {u.Role !== 'Admin' && (
                      <button onClick={() => setDeleteConfirmId(u.ID)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">{editingUser ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}</h2>
            </div>
            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div className="flex flex-col items-center mb-6">
                <div className="relative group cursor-pointer" onClick={() => document.getElementById('avatar-upload').click()}>
                  <div className="w-24 h-24 rounded-full border-4 border-slate-100 overflow-hidden bg-slate-50 flex items-center justify-center shadow-inner">
                    {formData.ProfileImage ? (
                      <img src={formData.ProfileImage} alt="Avatar Preview" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                    ) : (
                      <Users size={40} className="text-slate-300" />
                    )}
                  </div>
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus size={24} className="text-white" />
                  </div>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">คลิกเพื่ออัปโหลดรูปโปรไฟล์</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อ - นามสกุล / ชื่อเล่น <span className="text-red-500">*</span></label>
                <input required type="text" value={formData.Name} onChange={e => setFormData({...formData, Name: e.target.value})} className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อผู้ใช้ (Username) <span className="text-red-500">*</span></label>
                <input required type="text" value={formData.Username} onChange={e => setFormData({...formData, Username: e.target.value})} className="w-full px-4 py-2 border rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">รหัสผ่าน {editingUser && '(เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน)'} {!editingUser && <span className="text-red-500">*</span>}</label>
                <input required={!editingUser} type="text" placeholder={editingUser ? "••••••••" : ""} value={formData.Password} onChange={e => setFormData({...formData, Password: e.target.value})} className="w-full px-4 py-2 border rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <CustomSelect
                    label="สิทธิ์ (Role)"
                    value={formData.Role}
                    onChange={val => setFormData({...formData, Role: val})}
                    options={[
                      { label: 'พนักงาน (Staff)', value: 'Staff' },
                      { label: 'หัวหน้าแผนก (Head)', value: 'Head' },
                      { label: 'ผู้ดูแลระบบ (Admin)', value: 'Admin' }
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">แผนก <span className="text-red-500">*</span></label>
                  <input required type="text" value={formData.Department} onChange={e => setFormData({...formData, Department: e.target.value})} className="w-full px-4 py-2 border rounded-xl" placeholder="เช่น IT, HR" />
                </div>
              </div>
              <div>
                <CustomSelect
                  label="ตำแหน่งงาน (Position)"
                  value={formData.Position || ''}
                  onChange={val => setFormData({...formData, Position: val})}
                  options={[
                    { label: '— ไม่ระบุ —', value: '' },
                    ...positions.map(p => ({ label: p.Name, value: p.Name }))
                  ]}
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors">ยกเลิก</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors">บันทึก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <LoadingModal isOpen={loading} message="กำลังซิงค์ข้อมูลผู้ใช้งาน..." />
      <ConfirmModal isOpen={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} onConfirm={handleDeleteUser} title="ลบผู้ใช้งาน" message="คุณต้องการลบบัญชีผู้ใช้นี้ใช่หรือไม่?" type="danger" />
    </div>
  );
};
