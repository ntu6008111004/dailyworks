import React, { useState } from 'react';
import { X, Plus, Trash2, Link as LinkIcon, Image as ImageIcon, UploadCloud } from 'lucide-react';
import toast from 'react-hot-toast';
import { LoadingModal } from './LoadingModal';
import { ConfirmModal } from './ConfirmModal';
import { CustomSelect } from './CustomSelect';
import { CustomDatePicker } from './CustomDatePicker';

export const TaskModal = ({ task, onClose, onSave, closeOnOutsideClick = true }) => {
  
  const handleBackdropClick = (e) => {
    if (closeOnOutsideClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const [formData, setFormData] = useState(() => ({
    Detail: task?.Detail || '',
    Priority: task?.Priority || 'ปานกลาง',
    Status: task?.Status || 'ยังไม่เริ่ม',
    StartDate: task?.StartDate ? new Date(task.StartDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    DueDate: task?.DueDate ? new Date(task.DueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    Note: task?.Note || ''
  }));

  const [link, setLink] = useState(() => task?.CustomFields?.Link || '');
  const [project, setProject] = useState(() => task?.CustomFields?.Project || '');
  const [images, setImages] = useState(() => {
    try {
      if (!task) return [];
      const imgs = [];
      if (task.Image1) imgs.push(task.Image1);
      if (task.Image2) imgs.push(task.Image2);
      if (task.Image3) imgs.push(task.Image3);
      if (task.Image4) imgs.push(task.Image4);

      if (task.CustomFields && task.CustomFields.Images) {
        const oldImgs = JSON.parse(task.CustomFields.Images);
        imgs.push(...oldImgs);
      }
      return imgs.slice(0, 4); // Max 4 images
    } catch {
      return [];
    }
  });
  const [newImages, setNewImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  const [isDragging, setIsDragging] = useState(false);

  const [customFields, setCustomFields] = useState(() => {
    if (task?.CustomFields) {
      return Object.entries(task.CustomFields)
        .filter(([key]) => key !== 'Link' && key !== 'Images' && key !== 'Project')
        .map(([key, value]) => ({ key, value }));
    }
    return [];
  });

  const processFiles = (files) => {
    if (images.length + newImages.length + files.length > 4) {
      toast.error('คุณสามารถอัปโหลดรูปภาพได้สูงสุด 4 รูปเท่านั้น');
      return;
    }

    const newPromises = files.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            
            let currentMaxDim = 1200;
            let currentQuality = 0.8;

            const compress = () => {
              let curWidth = img.width;
              let curHeight = img.height;
              
              if (curWidth > curHeight) { 
                if (curWidth > currentMaxDim) { curHeight *= currentMaxDim / curWidth; curWidth = currentMaxDim; } 
              } else { 
                if (curHeight > currentMaxDim) { curWidth *= currentMaxDim / curHeight; curHeight = currentMaxDim; } 
              }
              
              canvas.width = curWidth;
              canvas.height = curHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, curWidth, curHeight);
              
              const dataUrl = canvas.toDataURL('image/webp', currentQuality);
              
              if (dataUrl.length > 600000) {
                if (currentQuality > 0.15) {
                  currentQuality -= 0.1;
                  compress();
                } else if (currentMaxDim > 300) {
                  currentMaxDim -= 100;
                  currentQuality = 0.6;
                  compress();
                } else {
                  resolve({ file, preview: dataUrl });
                }
              } else {
                resolve({ file, preview: dataUrl });
              }
            };

            compress();
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(newPromises).then(results => {
      setNewImages(prev => [...prev, ...results]);
    });
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) processFiles(files);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData.items;
    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      processFiles(files);
      toast.success(`วางรูปภาพ ${files.length} รูปเรียบร้อย`);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    if (files.length > 0) {
      processFiles(files);
      toast.success(`ลากวางรูปภาพ ${files.length} รูปเรียบร้อย`);
    } else {
      toast.error('กรุณาวางไฟล์รูปภาพเท่านั้น');
    }
  };

  const removeOldImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const removeNewImage = (index) => {
    setNewImages(newImages.filter((_, i) => i !== index));
  };

  const attemptSubmit = (e) => {
    e.preventDefault();
    setShowSaveConfirm(true);
  };

  const executeSubmit = async () => {
    setShowSaveConfirm(false);
    setIsUploading(true);

    try {
      let finalCustomFields = customFields.reduce((acc, field) => {
        if (field.key.trim()) {
          acc[field.key.trim()] = field.value;
        }
        return acc;
      }, {});

      if (link.trim()) finalCustomFields.Link = link.trim();
      if (project.trim()) finalCustomFields.Project = project.trim();

      let uploadedImageUrls = [...images];

      // Save base64 directly instead of Drive upload
      for (const img of newImages) {
        uploadedImageUrls.push(img.preview);
      }

      // Cleanup old custom fields to avoid duplicate data storage size
      if (finalCustomFields.Images) {
        delete finalCustomFields.Images;
      }

      await onSave({
        ...task,
        ...formData,
        Image1: uploadedImageUrls[0] || '',
        Image2: uploadedImageUrls[1] || '',
        Image3: uploadedImageUrls[2] || '',
        Image4: uploadedImageUrls[3] || '',
        CustomFields: finalCustomFields
      });
    } catch (error) {
      toast.error('อัปโหลดรูปล้มเหลว: ' + error.message);
    } finally {
      setIsUploading(false);
    }
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
    <div 
      className="ios-glass-overlay p-4 sm:p-6 overflow-y-auto !z-50"
      onClick={handleBackdropClick}
      onPaste={handlePaste}
    >
      <div className="ios-soft-card w-full max-w-2xl flex flex-col max-h-full relative shadow-2xl">
        {/* Top Accent Line */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {task ? 'แก้ไขข้อมูลงาน' : 'เพิ่มงานใหม่'}
            </h2>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-1">Task Management Suite</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all active:scale-90 shadow-sm border border-slate-200">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto flex-1 custom-scrollbar bg-white/50">
          <form id="task-form" onSubmit={attemptSubmit} className="space-y-8">
            <div className="space-y-6">
              <div className="group">
                <label className="block text-[13px] font-bold text-slate-900 mb-1.5 uppercase tracking-wider ml-0.5">ชื่อโปรเจค / งานหลัก</label>
                <input
                  type="text"
                  value={project}
                  onChange={e => setProject(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 font-semibold text-slate-800 text-sm"
                  placeholder="เช่น ปรับปรุงระบบเครือข่าย ปี 2568"
                />
              </div>

              <div>
                <label className="block text-[13px] font-bold text-slate-900 mb-1.5 uppercase tracking-wider ml-0.5">รายละเอียดงาน <span className="text-red-500">*</span></label>
                <textarea
                  required
                  value={formData.Detail}
                  onChange={e => setFormData({ ...formData, Detail: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all resize-y min-h-[120px] font-medium text-slate-800 leading-relaxed text-sm"
                  placeholder="พิมพ์รายละเอียดงานที่นี่..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <CustomSelect
                  label="สถานะการทำงาน"
                  value={formData.Status}
                  onChange={val => setFormData({ ...formData, Status: val })}
                  options={[
                    'ยังไม่เริ่ม',
                    'กำลังทำ',
                    'รอตรวจ',
                    'เสร็จสิ้น'
                  ]}
                />
                <CustomSelect
                  label="ความเร่งด่วน"
                  value={formData.Priority}
                  onChange={val => setFormData({ ...formData, Priority: val })}
                  options={['ต่ำ', 'ปานกลาง', 'สูง']}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <CustomDatePicker
                  label="วันที่เริ่มดำเนินการ"
                  required
                  selectedDate={formData.StartDate}
                  onChange={date => setFormData({ ...formData, StartDate: date })}
                />
                <CustomDatePicker
                  label="กำหนดส่งงาน"
                  required
                  selectedDate={formData.DueDate}
                  onChange={date => setFormData({ ...formData, DueDate: date })}
                />
              </div>

              {/* Link Input */}
              <div className="pt-2">
                <label className="block text-[12px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider ml-0.5 flex items-center gap-2">
                  <div className="w-5 h-5 flex items-center justify-center bg-blue-500/10 rounded-lg">
                    <LinkIcon size={12} className="text-blue-600" />
                  </div>
                  ลิงก์อ้างอิง (URL)
                </label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={link}
                  onChange={e => setLink(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none text-blue-600 font-semibold text-sm"
                />
              </div>

              {/* Image Upload Area */}
              <div className="ios-glass-pill p-5 border-white/40">
                <label className="block text-[12px] font-bold text-slate-600 mb-4 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ImageIcon size={16} className="text-indigo-500" />
                    รูปภาพประกอบ ({images.length + newImages.length}/4)
                  </span>
                  <span className="text-[9px] px-2 py-1 bg-white/50 rounded-lg text-slate-500 border border-white/60">
                    Max 4 Pics
                  </span>
                </label>

                <div 
                  className={`grid grid-cols-2 sm:grid-cols-4 gap-4 p-2 rounded-2xl transition-all ${
                    isDragging ? 'bg-indigo-500/10 scale-[1.02]' : ''
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {images.map((url, idx) => (
                    <div key={`old-${idx}`} className="relative group aspect-square rounded-2xl bg-white/30 border border-white/50 overflow-hidden shadow-sm">
                      <img src={url} alt={`Task ${idx}`} className="w-full h-full object-cover transition-transform group-hover:scale-110" onClick={() => setPreviewImage(url)} />
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeOldImage(idx); }} className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all shadow-lg scale-90 group-hover:scale-100">
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  {newImages.map((img, idx) => (
                    <div key={`new-${idx}`} className="relative group aspect-square rounded-2xl bg-white/30 border border-white/50 overflow-hidden shadow-sm">
                      <img src={img.preview} alt={`upload-${idx}`} className="w-full h-full object-cover transition-transform group-hover:scale-110" onClick={() => setPreviewImage(img.preview)} />
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeNewImage(idx); }} className="absolute top-1.5 right-1.5 p-1.5 bg-red-500 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all shadow-lg scale-90 group-hover:scale-100">
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  {images.length + newImages.length < 4 && (
                    <label className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-white/60 rounded-2xl hover:bg-white/60 hover:border-blue-400 cursor-pointer transition-all group">
                      <div className="p-3 bg-white/50 rounded-2xl text-slate-400 group-hover:text-blue-500 group-hover:scale-110 transition-all">
                        <UploadCloud size={28} />
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold mt-2 uppercase tracking-tighter">Add Photo</span>
                      <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageChange} />
                    </label>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-4 text-center italic">
                  * สามารถวางรูปภาพได้ทันทีด้วย Ctrl + V
                </p>
              </div>
            </div>

            {/* Custom Fields Area */}
            <div className="pt-8 border-t border-white/30">
              <div className="flex items-center justify-between mb-6 px-1">
                <h3 className="text-[13px] font-black text-slate-600 uppercase tracking-wider">ข้อมูลเพิ่มเติมเฉพาะงาน</h3>
                <button
                  type="button"
                  onClick={addCustomField}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-black text-blue-600 ios-glass-pill hover:bg-blue-500/10 transition-all"
                >
                  <Plus size={16} />
                  เพิ่มหัวข้อ
                </button>
              </div>

              <div className="space-y-4">
                {customFields.length === 0 ? (
                  <div className="py-10 text-center border-2 border-dashed border-white/50 rounded-3xl bg-white/10">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">No extra fields added</p>
                  </div>
                ) : (
                  customFields.map((field, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-slate-50/50 rounded-2xl border border-slate-100 shadow-sm">
                      <input
                        type="text"
                        placeholder="ชื่อหัวข้อ (เช่น เลขที่ PO)"
                        value={field.key}
                        onChange={e => updateCustomField(index, 'key', e.target.value)}
                        className="w-1/3 px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none font-bold text-slate-800 transition-all"
                      />
                        <input
                          type="text"
                          placeholder="รายละเอียดข้อมูล"
                          value={field.value}
                          onChange={e => updateCustomField(index, 'value', e.target.value)}
                          className="flex-1 px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none text-slate-600 transition-all"
                        />
                      <button
                        type="button"
                        onClick={() => removeCustomField(index)}
                        className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-500/10 rounded-xl transition-all"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </form>
        </div>

        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-white rounded-xl transition-all border border-slate-200"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            form="task-form"
            className="px-8 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
          >
            บันทึกข้อมูลงาน
          </button>
        </div>
      </div>

      <LoadingModal isOpen={isUploading} message="กำลังบันทึกและอัปโหลดรูปภาพ..." />

      <ConfirmModal
        isOpen={showSaveConfirm}
        onClose={() => setShowSaveConfirm(false)}
        onConfirm={executeSubmit}
        title="ยืนยันการบันทึก"
        message="คุณต้องการบันทึกข้อมูลงานนี้ใช่หรือไม่?"
        type="success"
      />

      {previewImage && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-4 right-4 p-2 bg-white/10 text-white rounded-full hover:bg-white/20 transition-colors">
            <X size={24} />
          </button>
          <img src={previewImage} alt="Preview" className="max-w-full max-h-screen object-contain rounded-lg shadow-2xl animate-in zoom-in-95" />
        </div>
      )}
    </div>
  );
};
