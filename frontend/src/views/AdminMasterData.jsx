import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Database, X, Check } from 'lucide-react';
import { apiService } from '../services/api';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../components/ConfirmModal';
import { LoadingModal } from '../components/LoadingModal';

export const AdminMasterData = () => {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState(null);
  const [positionName, setPositionName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        await apiService.migratePositionsSheet();
        await apiService.migrateUsersAddPosition();
      } catch (err) {
        console.error('Migration failed:', err);
      }
      await fetchPositions();
    };
    init();
  }, []);

  const fetchPositions = async () => {
    setLoading(true);
    try {
      const data = await apiService.getPositions();
      setPositions(data || []);
    } catch {
      toast.error('ไม่สามารถดึงข้อมูลตำแหน่งได้');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (pos = null) => {
    setEditingPosition(pos);
    setPositionName(pos ? pos.Name : '');
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const name = positionName.trim();
    if (!name) return;
    setLoading(true);
    try {
      if (editingPosition) {
        await apiService.updatePosition({ ID: editingPosition.ID, Name: name });
        toast.success('อัปเดตตำแหน่งเรียบร้อย');
      } else {
        await apiService.addPosition({ Name: name });
        toast.success('เพิ่มตำแหน่งเรียบร้อย');
      }
      setIsModalOpen(false);
      fetchPositions();
    } catch (err) {
      toast.error(err.message);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    setLoading(true);
    try {
      await apiService.deletePosition(deleteConfirmId);
      toast.success('ลบตำแหน่งเรียบร้อย');
      setDeleteConfirmId(null);
      fetchPositions();
    } catch (err) {
      toast.error(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <LoadingModal isOpen={loading} message="กำลังซิงค์ข้อมูลตำแหน่งงาน..." />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Database size={26} className="text-violet-600" />
            Master Data — ตำแหน่งงาน
          </h2>
          <p className="text-slate-500">จัดการรายการตำแหน่งงานสำหรับใช้ในระบบ (Admin เท่านั้น)</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-all shadow-sm focus:ring-4 focus:ring-violet-100"
        >
          <Plus size={20} />
          <span>เพิ่มตำแหน่ง</span>
        </button>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-violet-50/60 text-slate-600 border-b border-violet-100">
            <tr>
              <th className="px-6 py-4 font-semibold w-16">#</th>
              <th className="px-6 py-4 font-semibold">ชื่อตำแหน่งงาน</th>
              <th className="px-6 py-4 font-semibold text-xs text-slate-400 uppercase tracking-wider">ID</th>
              <th className="px-6 py-4 font-semibold text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {positions.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                  ยังไม่มีตำแหน่งงาน — กดปุ่มเพิ่มตำแหน่งเพื่อเริ่มต้น
                </td>
              </tr>
            )}
            {positions.map((pos, idx) => (
              <tr key={pos.ID} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-6 py-4 text-slate-400 font-medium">{idx + 1}</td>
                <td className="px-6 py-4">
                  <span className="font-semibold text-slate-800">{pos.Name}</span>
                </td>
                <td className="px-6 py-4">
                  <code className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-mono">{pos.ID}</code>
                </td>
                <td className="px-6 py-4 text-right space-x-2">
                  <button
                    onClick={() => handleOpenModal(pos)}
                    className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                    title="แก้ไข"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(pos.ID)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="ลบ"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingPosition ? 'แก้ไขตำแหน่งงาน' : 'เพิ่มตำแหน่งงานใหม่'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ชื่อตำแหน่ง <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  value={positionName}
                  onChange={e => setPositionName(e.target.value)}
                  placeholder="เช่น ผู้จัดการ, วิศวกรซอฟต์แวร์, นักบัญชี..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors text-sm"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-colors text-sm"
                >
                  <Check size={16} />
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={handleDelete}
        title="ลบตำแหน่งงาน"
        message="คุณต้องการลบตำแหน่งงานนี้ใช่หรือไม่? บัญชีผู้ใช้ที่ใช้ตำแหน่งนี้จะไม่ถูกกระทบ"
        type="danger"
      />
    </div>
  );
};
