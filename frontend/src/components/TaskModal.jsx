import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

export const TaskModal = ({ task, onClose, onSave }) => {
  const [formData, setFormData] = useState(() => ({
    Detail: task?.Detail || '',
    Priority: task?.Priority || 'ปานกลาง',
    Status: task?.Status || 'ยังไม่เริ่ม',
    StartDate: task?.StartDate ? new Date(task.StartDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    DueDate: task?.DueDate ? new Date(task.DueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    Note: task?.Note || ''
  }));

  const [customFields, setCustomFields] = useState(() => {
    if (task?.CustomFields) {
      return Object.entries(task.CustomFields).map(([key, value]) => ({ key, value }));
    }
    return [];
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalCustomFields = customFields.reduce((acc, field) => {
      if (field.key.trim()) {
        acc[field.key.trim()] = field.value;
      }
      return acc;
    }, {});

    onSave({
      ...task,
      ...formData,
      CustomFields: finalCustomFields
    });
  };

  const addCustomField = () => {
    setCustomFields([...customFields, { key: '', value: '' }]);
  };

  const updateCustomField = (index, field, value) => {
    const updated = [...customFields];
    updated[index][field] = value;
    setCustomFields(updated);
  };

  const removeCustomField = (index) => {
    setCustomFields(customFields.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-full animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-900">
            {task ? 'แก้ไขงาน' : 'งานใหม่'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <form id="task-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">รายละเอียดงาน</label>
                <textarea
                  required
                  value={formData.Detail}
                  onChange={e => setFormData({ ...formData, Detail: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none h-24"
                  placeholder="รายละเอียดงานที่ต้องทำ..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">สถานะ</label>
                  <select
                    value={formData.Status}
                    onChange={e => setFormData({ ...formData, Status: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white"
                  >
                    <option value="ยังไม่เริ่ม">ยังไม่เริ่ม</option>
                    <option value="กำลังทำ">กำลังทำ</option>
                    <option value="รอตรวจ">รอตรวจ</option>
                    <option value="รอแก้ไข">รอแก้ไข</option>
                    <option value="เสร็จสิ้น">เสร็จสิ้น</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ความสำคัญ</label>
                  <select
                    value={formData.Priority}
                    onChange={e => setFormData({ ...formData, Priority: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white"
                  >
                    <option value="ต่ำ">ต่ำ</option>
                    <option value="ปานกลาง">ปานกลาง</option>
                    <option value="สูง">สูง</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">วันที่เริ่ม</label>
                  <input
                    type="date"
                    required
                    value={formData.StartDate}
                    onChange={e => setFormData({ ...formData, StartDate: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">กำหนดส่ง</label>
                  <input
                    type="date"
                    required
                    value={formData.DueDate}
                    onChange={e => setFormData({ ...formData, DueDate: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">รายละเอียดเพิ่มเติม (ตามตำแหน่ง)</h3>
                <button
                  type="button"
                  onClick={addCustomField}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <Plus size={16} />
                  เพิ่มหัวข้อ
                </button>
              </div>

              <div className="space-y-3">
                {customFields.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    เพิ่มข้อมูลเพิ่มเติมของงานแบบอิสระ (เช่น รหัสพัสดุ, ลิงก์แนบไฟล์...)
                  </p>
                ) : (
                  customFields.map((field, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <div className="flex-1 space-y-2 sm:space-y-0 sm:flex sm:gap-2">
                        <input
                          type="text"
                          placeholder="ชื่อหัวข้อ"
                          value={field.key}
                          onChange={e => updateCustomField(index, 'key', e.target.value)}
                          className="w-full sm:w-1/3 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                        />
                        <input
                          type="text"
                          placeholder="รายละเอียด"
                          value={field.value}
                          onChange={e => updateCustomField(index, 'value', e.target.value)}
                          className="w-full sm:w-2/3 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCustomField(index)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-xl transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            form="task-form"
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm focus:ring-4 focus:ring-blue-100"
          >
            บันทึกงาน
          </button>
        </div>
      </div>
    </div>
  );
};
