import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Upload, Camera, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { LoadingModal } from '../components/LoadingModal';
import { ConfirmModal } from '../components/ConfirmModal';

export const MyProfile = () => {
  const { user, updateUserState } = useAuth();
  const fileInputRef = useRef(null);
  
  const [loading, setLoading] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    ID: user?.ID || '',
    Username: user?.Username || user?.username || '',
    Password: '',
    Name: user?.Name || user?.name || '',
    ProfileImage: user?.ProfileImage || ''
  });

  const compressProfileImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 150; 
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
          
          resolve(canvas.toDataURL('image/webp', 0.5));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
        return;
      }
      
      const loadingToast = toast.loading('กำลังประมวลผลรูปภาพ...');
      try {
        const compressedBase64 = await compressProfileImage(file);
        setFormData({ ...formData, ProfileImage: compressedBase64 });
        toast.dismiss(loadingToast);
      } catch {
        toast.error('เกิดข้อผิดพลาดในการจัดการรูปภาพ');
        toast.dismiss(loadingToast);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsConfirmOpen(true);
  };

  const confirmSave = async () => {
    setIsConfirmOpen(false);
    setLoading(true);
    
    try {
      const updateData = { ...formData };
      
      // Preserve original role and department
      updateData.Role = user?.Role || user?.role;
      updateData.Department = user?.Department || user?.department;
      
      if (!updateData.Password) {
        delete updateData.Password;
      }
      
      await apiService.updateUser(updateData);
      
      // Update global context 
      updateUserState(updateData);
      
      // Clear password field after successful update
      setFormData(prev => ({ ...prev, Password: '' }));
      
      toast.success('อัปเดตข้อมูลส่วนตัวเรียบร้อย');
    } catch (error) {
      console.error('Update error:', error);
      toast.error('ไม่สามารถอัปเดตข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-10">
      <LoadingModal isOpen={loading} message="กำลังบันทึกข้อมูล..." />
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">บัญชีของฉัน</h2>
          <p className="text-slate-500">จัดการข้อมูลส่วนตัวและรหัสผ่าน</p>
        </div>
      </div>

      <div className="glass rounded-xl border border-slate-200/60 overflow-hidden shadow-sm">
        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
          
          {/* Profile Image Section */}
          <div className="flex flex-col items-center justify-center pb-6 border-b border-slate-100">
            <div className="relative group">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-lg bg-slate-100 flex items-center justify-center">
                {formData.ProfileImage ? (
                  <img src={formData.ProfileImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl font-bold text-slate-400">
                    {formData.Name?.charAt(0) || 'U'}
                  </span>
                )}
              </div>
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2.5 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 hover:scale-105 transition-all"
              >
                <Camera size={18} />
              </button>
              
              {formData.ProfileImage && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, ProfileImage: '' })}
                  className="absolute top-0 right-0 p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="ลบรูปภาพ"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageChange}
              accept="image/*"
              className="hidden"
            />
            <p className="text-xs text-slate-400 mt-4 text-center max-w-xs">
              รองรับไฟล์ JPG, PNG ขนาดจะถูกบีบอัดอัตโนมัติเพื่อให้โหลดเร็วขึ้น
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">ชื่อผู้ใช้งาน (Username) *</label>
              <input
                type="text"
                required
                value={formData.Username}
                onChange={(e) => setFormData({...formData, Username: e.target.value})}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                placeholder="กรอกชื่อผู้ใช้งาน"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">รหัสผ่านใหม่</label>
              <input
                type="password"
                value={formData.Password}
                onChange={(e) => setFormData({...formData, Password: e.target.value})}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                placeholder="เว้นว่างไว้หากไม่ต้องการเปลี่ยน"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-slate-700">ชื่อ-นามสกุล (แสดงในระบบ) *</label>
              <input
                type="text"
                required
                value={formData.Name}
                onChange={(e) => setFormData({...formData, Name: e.target.value})}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                placeholder="เช่น นาย ใจดี สมมติ"
              />
            </div>

            {/* Read-only fields to let user know their role */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-500">สิทธิ์การใช้งาน</label>
              <input
                type="text"
                disabled
                value={user?.Role || user?.role || 'Staff'}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed uppercase font-medium"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-500">แผนก</label>
              <input
                type="text"
                disabled
                value={user?.Department || user?.department || '-'}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>
          
          <div className="pt-4 mt-8 border-t border-slate-200">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={20} />
              บันทึกการเปลี่ยนแปลง
            </button>
          </div>
        </form>
      </div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={confirmSave}
        title="ยืนยันการบันทึกข้อมูล"
        message="คุณแน่ใจหรือไม่ว่าต้องการบันทึกการเปลี่ยนแปลงข้อมูลส่วนตัว?"
      />
    </div>
  );
};
