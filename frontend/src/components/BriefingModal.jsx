import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Link as LinkIcon, Image as ImageIcon, UploadCloud, User, CheckCircle2, AlertCircle, Save, ExternalLink, NotebookTabs, Calendar, Clock, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { LoadingModal } from './LoadingModal';
import { ConfirmModal } from './ConfirmModal';
import { CustomSelect } from './CustomSelect';
import { CustomDatePicker } from './CustomDatePicker';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

const BRIEFING_PALETTE = [
  { name: 'Crimson', hex: '#be123c', text: 'white' },   // Deep Rose
  { name: 'Violet', hex: '#7c3aed', text: 'white' },    // Rich Purple
  { name: 'Sapphire', hex: '#1d4ed8', text: 'white' },  // Strong Blue
  { name: 'Indigo', hex: '#4338ca', text: 'white' },    // Deep Blue-Purple
  { name: 'Turquoise', hex: '#0d9488', text: 'white' }, // Teal
  { name: 'Orange', hex: '#ea580c', text: 'white' },    // Strong Orange
  { name: 'Slate', hex: '#475569', text: 'white' },     // Professional Gray
  { name: 'Sky', hex: '#0284c7', text: 'white' },      // Bright Sky
];

const ACTIVE_COLORS = {
  'รอดำเนินการ': 'bg-slate-600 border-slate-600 text-white shadow-md',
  'กำลังทำ': 'bg-blue-600 border-blue-600 text-white shadow-md',
  'รอตรวจ': 'bg-pink-400 border-pink-400 text-white shadow-md',
  'รอแก้ไข': 'bg-yellow-400 border-yellow-400 text-yellow-950 shadow-md',
  'เสร็จสิ้น': 'bg-[#198754] border-[#198754] text-white shadow-md',
  'ยกเลิกงาน': 'bg-zinc-600 border-zinc-600 text-white shadow-md'
};

const READONLY_COLORS = {
  'รอดำเนินการ': 'bg-slate-50 text-slate-600 border border-slate-200 ring-slate-500/10',
  'กำลังทำ': 'bg-blue-50 text-blue-600 border border-blue-200 ring-blue-500/10',
  'รอตรวจ': 'bg-pink-50 text-pink-600 border border-pink-200 ring-pink-500/10',
  'รอแก้ไข': 'bg-yellow-50 text-yellow-700 border border-yellow-200 ring-yellow-500/10',
  'เสร็จสิ้น': 'bg-green-50 text-green-700 border border-green-200 ring-green-500/10',
  'ยกเลิกงาน': 'bg-zinc-50 text-zinc-600 border border-zinc-200 ring-zinc-500/10'
};

export const BriefingModal = ({ briefing, onClose, onSaved, allUsers }) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [responses, setResponses] = useState([]);
  const [isLoadingResponses, setIsLoadingResponses] = useState(true);
  const [reviewerNote, setReviewerNote] = useState('');
  const [reviewerImages, setReviewerImages] = useState([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState(() => {
    if (briefing?.Assignees?.some(id => String(id) === String(user?.ID))) {
      return String(user?.ID);
    }
    return briefing?.Assignees?.length > 0 ? String(briefing.Assignees[0]) : null;
  });
  const [previewImage, setPreviewImage] = useState(null);
  const [focusedSide, setFocusedSide] = useState(() => {
    // If Assignee is viewing their own tasks, right is active. Admin defaults to left.
    if (briefing?.Assignees?.some(id => String(id) === String(user?.ID))) return null;
    return 'left';
  });
  const [isDragging, setIsDragging] = useState(false);
  
  const isCreator = !briefing || String(briefing.CreatorID) === String(user?.ID);
  const isAdmin = user?.Role === 'Admin';
  const canEditCore = !briefing || isCreator || isAdmin;
  
  const [formData, setFormData] = useState({
    Title: briefing?.Title || '',
    Detail: briefing?.Detail || '',
    CreatorNote: briefing?.CreatorNote || '',
    Priority: briefing?.Priority || 'Medium',
    Status: briefing?.Status || 'รอดำเนินการ',
    StartDate: briefing?.StartDate || new Date().toISOString().split('T')[0],
    DueDate: briefing?.DueDate || new Date().toISOString().split('T')[0],
    Assignees: briefing?.Assignees || [],
    RefURL: briefing?.RefURL || '',
    CardColor: briefing?.CardColor || ''
  });

  const [refImages, setRefImages] = useState(() => {
    const imgs = [];
    if (briefing?.RefImage1) imgs.push(briefing.RefImage1);
    if (briefing?.RefImage2) imgs.push(briefing.RefImage2);
    if (briefing?.RefImage3) imgs.push(briefing.RefImage3);
    if (briefing?.RefImage4) imgs.push(briefing.RefImage4);
    if (briefing?.RefImage5) imgs.push(briefing.RefImage5);
    if (briefing?.RefImage6) imgs.push(briefing.RefImage6);
    return imgs;
  });

  // Assignee's own response state
  const [myResponse, setMyResponse] = useState({
    ResultImages: [],
    URL1: '',
    URL2: '',
    Status: 'รอดำเนินการ',
    Note: ''
  });

  const isAssignee = briefing?.Assignees?.some(id => String(id) === String(user?.ID));

  const loadResponses = useCallback(async () => {
    setIsLoadingResponses(true);
    try {
      if (!briefing?.ID) return;
      const data = await apiService.getBriefingResponses(briefing.ID);
      setResponses(data || []);
      
      // Select the current user if they are an assignee, otherwise select first assignee
      if (isAssignee) {
        setSelectedAssigneeId(String(user?.ID));
        const resp = data.find(r => String(r.UserID) === String(user?.ID));
        if (resp) {
          const imgs = [];
          [1,2,3,4,5,6].forEach(i => { if (resp[`ResultImage${i}`]) imgs.push(resp[`ResultImage${i}`]); });
          setMyResponse({
            ResultImages: imgs,
            URL1: resp.URL1 || '',
            URL2: resp.URL2 || '',
            Status: resp.Status || 'รอดำเนินการ',
            Note: resp.Note || ''
          });
        }
      } else if (briefing.Assignees?.length > 0) {
        setSelectedAssigneeId(String(briefing.Assignees[0]));
      }
    } catch (e) {
      console.error('Failed to load responses', e);
    } finally {
      setIsLoadingResponses(false);
    }
  }, [briefing?.ID, isAssignee, user?.ID, briefing?.Assignees]);

  useEffect(() => {
    if (briefing?.ID) {
      loadResponses();
    }
  }, [briefing?.ID, loadResponses]);

  // Ctrl+V Paste handling for images
  useEffect(() => {
    const handlePaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      const files = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          files.push(items[i].getAsFile());
        }
      }
      
      if (files.length > 0) {
        const news = await Promise.all(files.map(processImage));
        // If we're an assignee and on our tab, or if we're the creator
        if (selectedAssigneeId === String(user?.ID)) {
          if (myResponse.ResultImages.length + news.length > 6) { toast.error('สูงสุด 6 รูป', { position: 'bottom-right' }); return; }
          setMyResponse(prev => ({ ...prev, ResultImages: [...prev.ResultImages, ...news] }));
          toast.success('วางรูปภาพสำเร็จ (ผลการทำงาน)', { position: 'bottom-right' });
        } else if (canEditCore) {
          if (refImages.length + news.length > 6) { toast.error('สูงสุด 6 รูป', { position: 'bottom-right' }); return; }
          setRefImages(prev => [...prev, ...news]);
          toast.success('วางรูปภาพสำเร็จ (รูปอ้างอิง)', { position: 'bottom-right' });
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [canEditCore, refImages, myResponse, selectedAssigneeId, user?.ID]);

  const handleSaveBriefing = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        ...formData,
        ...refImages.reduce((acc, img, i) => {
          acc[`RefImage${i+1}`] = img;
          return acc;
        }, {})
      };
      
      if (briefing?.ID) {
        payload.ID = briefing.ID;
        await apiService.updateBriefing(payload);
      } else {
        await apiService.addBriefing(payload);
      }
      toast.success('บันทึกบรีฟงานเรียบร้อย', { position: 'bottom-right' });
      onSaved();
    } catch (e) {
      toast.error('ล้มเหลว: ' + e.message, { position: 'bottom-right' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveResponse = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Auto status trigger: If first time recording, set status to 'รอตรวจ' (Waiting for Review)
      let currentStatus = myResponse.Status;
      const isFirstRecord = !responses.find(r => String(r.UserID) === String(user?.ID));
      const hasContent = myResponse.ResultImages.length > 0 || myResponse.URL1 || myResponse.URL2 || myResponse.Note;
      
      if (currentStatus === 'รอแก้ไข') {
        currentStatus = 'รอตรวจ';
      }
      if (isFirstRecord && hasContent && (currentStatus === 'รอดำเนินการ' || !currentStatus)) {
        currentStatus = 'รอตรวจ';
      }

      const payload = {
        BriefingID: briefing.ID,
        UserID: user?.ID,
        URL1: myResponse.URL1,
        URL2: myResponse.URL2,
        Status: currentStatus,
        Note: myResponse.Note,
        ...myResponse.ResultImages.reduce((acc, img, i) => {
          acc[`ResultImage${i+1}`] = img;
          return acc;
        }, {})
      };
      await apiService.saveBriefingResponse(payload);
      
      // Auto Overall Status Calculation
      await triggerAutoOverallStatus(currentStatus);
      
      toast.success('บันทึกผลการบรีฟเรียบร้อย', { position: 'bottom-right' });
      loadResponses();
      onSaved();
    } catch (e) {
      toast.error('ล้มเหลว: ' + e.message, { position: 'bottom-right' });
    } finally {
      setSaving(false);
    }
  };

  const triggerAutoOverallStatus = async () => {
    if (!briefing?.ID) return;
    
    // Get latest responses (including the one just saved)
    const latestResps = await apiService.getBriefingResponses(briefing.ID);
    const assigneeIds = formData.Assignees;
    
    // Logic:
    // 1. If any is 'รอตรวจ' (Waiting for Review), overall is 'รอตรวจ' because admin MUST check it.
    // 2. Else if any is 'รอแก้ไข' (Admin asked for changes), overall is 'รอแก้ไข'.
    // 3. Else if any is 'กำลังทำ', overall is 'กำลังทำ'.
    // 4. Else if EVERYONE is 'เสร็จสิ้น', overall is 'เสร็จสิ้น'.
    // 5. Else if EVERYONE is 'รอดำเนินการ', overall is 'รอดำเนินการ'.
    // 6. Else Mixed (e.g. some เสร็จสิ้น, some รอดำเนินการ), overall is 'กำลังทำ'.
    
    let newOverallStatus = briefing.Status;
    const statuses = assigneeIds.map(id => {
      const r = latestResps.find(resp => String(resp.UserID) === String(id));
      return r?.Status || 'รอดำเนินการ';
    });

    if (statuses.some(s => s === 'รอตรวจ')) newOverallStatus = 'รอตรวจ';
    else if (statuses.some(s => s === 'รอแก้ไข')) newOverallStatus = 'รอแก้ไข';
    else if (statuses.some(s => s === 'กำลังทำ')) newOverallStatus = 'กำลังทำ';
    else if (statuses.every(s => s === 'เสร็จสิ้น')) newOverallStatus = 'เสร็จสิ้น';
    else if (statuses.every(s => s === 'รอดำเนินการ')) newOverallStatus = 'รอดำเนินการ';
    else newOverallStatus = 'กำลังทำ';

    if (newOverallStatus !== briefing.Status) {
      await apiService.updateBriefing({ ...formData, ID: briefing.ID, Status: newOverallStatus });
    }
  };

  const processImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let currentMaxDim = 1200; // Start larger for clarity
          let currentQuality = 0.8; // High initial quality

          const compress = () => {
            let width = img.width;
            let height = img.height;
            if (width > height) { if (width > currentMaxDim) { height *= currentMaxDim / width; width = currentMaxDim; } }
            else { if (height > currentMaxDim) { width *= currentMaxDim / height; height = currentMaxDim; } }
            
            canvas.width = width; 
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/webp', currentQuality);
            
            // Limit to 47000 characters
            if (dataUrl.length > 47000) {
              if (currentQuality > 0.4) {
                // Lower quality slightly to preserve sharpness
                currentQuality -= 0.1;
                compress();
              } else if (currentMaxDim > 600) {
                // If quality is low, shrink dimensions down to 600px
                currentMaxDim -= 200;
                currentQuality = 0.7; // Reset quality for new dimension
                compress();
              } else {
                // Return best effort
                resolve(dataUrl);
              }
            } else {
              resolve(dataUrl);
            }
          };

          compress();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRefImageAdd = async (e) => {
    const files = Array.from(e.target.files);
    if (refImages.length + files.length > 6) { toast.error('สูงสุด 6 รูป', { position: 'bottom-right' }); return; }
    const news = await Promise.all(files.map(processImage));
    setRefImages([...refImages, ...news]);
  };

  const handleResultImageAdd = async (e) => {
    const files = Array.from(e.target.files);
    if (myResponse.ResultImages.length + files.length > 6) { toast.error('สูงสุด 6 รูป', { position: 'bottom-right' }); return; }
    const news = await Promise.all(files.map(processImage));
    setMyResponse({ ...myResponse, ResultImages: [...myResponse.ResultImages, ...news] });
  };

  const selectedUserInfo = allUsers.find(u => String(u.ID) === String(selectedAssigneeId));
  const selectedResponse = responses.find(r => String(r.UserID) === String(selectedAssigneeId));

  useEffect(() => {
    if (selectedResponse) {
      const imgs = [];
      for (let i = 1; i <= 6; i++) {
        const url = selectedResponse[`ReviewImage${i}`];
        if (url && url.trim() !== '') imgs.push(url);
      }
      setReviewerImages(imgs);
      setReviewerNote('');
    } else {
      setReviewerImages([]);
      setReviewerNote('');
    }
  }, [selectedResponse]);

  const handleDragOver = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
  };
  const handleDrop = async (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    
    if (String(user?.ID) === selectedAssigneeId && myResponse) {
      if (myResponse.ResultImages.length + files.length > 6) { toast.error('แนบรูปได้สูงสุด 6 รูป', { position: 'bottom-right' }); return; }
      const processed = await Promise.all(files.map(processImage));
      setMyResponse(prev => ({...prev, ResultImages: [...prev.ResultImages, ...processed]}));
      toast.success(`ลากวางรูป ${files.length} รูปเรียบร้อย`, { position: 'bottom-right' });
    } else if (canEditCore) {
      if (focusedSide === 'right') {
        if (reviewerImages.length + files.length > 6) { toast.error('สูงสุด 6 รูป (ลบรูปเดิมก่อน)', { position: 'bottom-right' }); return; }
        const processed = await Promise.all(files.map(processImage));
        setReviewerImages(prev => [...prev, ...processed]);
        toast.success(`ลากวางรูปตรวจประเมิน ${files.length} รูปเรียบร้อย`, { position: 'bottom-right' });
      } else {
        if (refImages.length + files.length > 6) { toast.error('สูงสุด 6 รูป', { position: 'bottom-right' }); return; }
        const processed = await Promise.all(files.map(processImage));
        setRefImages(prev => [...prev, ...processed]);
        toast.success(`ลากวางรูปอ้างอิง ${files.length} รูปเรียบร้อย`, { position: 'bottom-right' });
      }
    }
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      if (String(user?.ID) === selectedAssigneeId && myResponse) {
        if (myResponse.ResultImages.length + files.length > 6) { toast.error('แนบรูปได้สูงสุด 6 รูป', { position: 'bottom-right' }); return; }
        const processed = await Promise.all(files.map(processImage));
        setMyResponse(prev => ({...prev, ResultImages: [...prev.ResultImages, ...processed]}));
        toast.success(`เพิ่มรูป ${files.length} รูป`, { position: 'bottom-right' });
      } else if (canEditCore) {
        if (focusedSide === 'right') {
          if (reviewerImages.length + files.length > 6) { toast.error('สูงสุด 6 รูป', { position: 'bottom-right' }); return; }
          const processed = await Promise.all(files.map(processImage));
          setReviewerImages(prev => [...prev, ...processed]);
          toast.success(`เพิ่มรูปตรวจประเมิน ${files.length} รูป`, { position: 'bottom-right' });
        } else {
          if (refImages.length + files.length > 6) { toast.error('สูงสุด 6 รูป', { position: 'bottom-right' }); return; }
          const processed = await Promise.all(files.map(processImage));
          setRefImages(prev => [...prev, ...processed]);
          toast.success(`เพิ่มรูปอ้างอิง ${files.length} รูป`, { position: 'bottom-right' });
        }
      }
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      <div className={`bg-white rounded-[2rem] w-full max-w-5xl h-[90vh] shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 border-4 transition-colors ${isDragging ? 'border-blue-500' : 'border-transparent'}`}>
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50 rounded-t-[2rem]">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
               <NotebookTabs size={24} />
             </div>
             <div>
               <h2 className="text-xl font-bold text-slate-800">
                 {briefing ? `บรีฟงาน #${briefing.RunningID}` : 'สร้างบรีฟงานใหม่'}
               </h2>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium font-inter">
                  {briefing && (
                    <span className="flex items-center gap-1">
                      <Calendar size={12} /> {format(new Date(briefing.CreatedAt), 'dd/MM/yyyy')}
                    </span>
                  )}
                  {saving && (
                    <span className="flex items-center gap-1.5 text-blue-600 font-bold animate-pulse ml-2 px-2 py-0.5 bg-blue-50 rounded-lg">
                      <RefreshCw size={12} className="animate-spin" /> กำลังบันทึก...
                    </span>
                  )}
                </div>
              </div>
          </div>
          <div className="flex items-center gap-2">
            {canEditCore && briefing?.ID && (
              <button 
                onClick={() => {
                  if (saving) return;
                  if (window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบบรีฟงานนี้?')) {
                    setSaving(true);
                    apiService.deleteBriefing(briefing.ID)
                      .then(() => {
                        toast.success('ลบบรีฟงานเรียบร้อย', { position: 'bottom-right' });
                        onSaved();
                      })
                      .catch(e => toast.error('ล้มเหลว: ' + e.message, { position: 'bottom-right' }))
                      .finally(() => setSaving(false));
                  }
                }}
                disabled={saving}
                className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                title="ลบบรีฟงาน"
              >
                <Trash2 size={24} />
              </button>
            )}
            <button onClick={onClose} className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            
            {/* Left Column: Core Briefing (ID 4) */}
            <div className={`lg:col-span-7 space-y-8 transition-all duration-300 relative ${focusedSide === 'right' ? 'opacity-30 blur-[2px]' : ''}`}>
              {focusedSide === 'right' && <div className="absolute inset-0 z-10 cursor-pointer" onClick={() => setFocusedSide('left')} title="คลิกเพื่อแก้ไขส่วนบรีฟงาน" />}
              
              <section className="space-y-4">
                <div className="space-y-2">
                   <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">หัวเรื่อง / โปรเจค</label>
                   <input 
                    type="text"
                    value={formData.Title}
                    onChange={e => setFormData({...formData, Title: e.target.value})}
                    placeholder="ใส่หัวเรื่องงานบรีฟ..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none font-bold"
                    readOnly={!canEditCore}
                   />
                </div>

                <div className="flex flex-col gap-4 p-5 bg-slate-50 border border-slate-200 rounded-3xl">
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">ระดับความสำคัญ</label>
                       <div className="flex gap-1.5">
                          {['High', 'Medium', 'Low'].map(p => (
                            <button 
                             key={p}
                             type="button"
                             onClick={() => canEditCore && setFormData({...formData, Priority: p})}
                             className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${formData.Priority === p ? (p === 'High' ? 'bg-red-500 border-red-500 text-white' : p === 'Medium' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-blue-500 border-blue-500 text-white shadow-md scale-105') : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                             disabled={!canEditCore}
                            >
                              {p === 'High' ? 'สูง' : p === 'Medium' ? 'กลาง' : 'ต่ำ'}
                            </button>
                          ))}
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">สถานะภาพรวม</label>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {['รอดำเนินการ', 'กำลังทำ', 'รอตรวจ', 'รอแก้ไข', 'เสร็จสิ้น', 'ยกเลิกงาน'].map(s => {
                            const isActive = formData.Status === s;
                            if (!canEditCore) {
                              if (!isActive) return null;
                              return (
                                <div key={s} className={`px-2 py-2 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5 ${READONLY_COLORS[s] || 'bg-slate-50 text-slate-500'}`}>
                                  <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse opacity-50" />
                                  {s}
                                </div>
                              );
                            }
                            return (
                              <button 
                                key={s} 
                                type="button"
                                onClick={() => setFormData({...formData, Status: s})}
                                disabled={saving}
                                className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all ${isActive ? ACTIVE_COLORS[s] : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'} ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                {s}
                              </button>
                            );
                          })}
                        </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <CustomDatePicker 
                       label="วันที่เริ่มบรีฟ" 
                       selectedDate={formData.StartDate} 
                       onChange={v => setFormData({...formData, StartDate: v})} 
                       readonly={!canEditCore}
                     />
                     <CustomDatePicker 
                       label="กำหนดส่งงาน" 
                       selectedDate={formData.DueDate} 
                       onChange={v => setFormData({...formData, DueDate: v})} 
                       readonly={!canEditCore}
                     />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">รายละเอียดการบรีฟ</h3>
                </div>
                
                {canEditCore ? (
                  <textarea 
                    value={formData.Detail}
                    onChange={e => setFormData({...formData, Detail: e.target.value})}
                    placeholder="ใส่รายละเอียดสิ่งที่ต้องการให้ทำ..."
                    className="w-full min-h-[120px] p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                  />
                ) : (
                  <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-2xl text-slate-700 leading-relaxed whitespace-pre-line font-medium italic">
                    {briefing?.Detail}
                  </div>
                )}
              </section>

              {canEditCore && (
                <section className="space-y-3">
                   <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">หมายเหตุ (ภายใน)</label>
                   <textarea 
                    value={formData.CreatorNote}
                    onChange={e => setFormData({...formData, CreatorNote: e.target.value})}
                    placeholder="โน้ตช่วยจำ หรือคำแนะนำเพิ่มเติม..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm italic"
                   />
                </section>
              )}

              {/* Reference Images */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                   <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                     <ImageIcon size={14} className="text-blue-500" />
                     รูปภาพอ้างอิง (Ref Images)
                   </h3>
                   {canEditCore && (
                     <label className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                       เพิ่มรูปภาพ ({refImages.length}/6)
                       <input type="file" multiple accept="image/*" className="hidden" onChange={handleRefImageAdd} disabled={refImages.length >= 6} />
                     </label>
                   )}
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  {refImages.map((img, i) => (
                    <div key={i} className="relative aspect-[4/3] rounded-xl overflow-hidden group border border-slate-200 shadow-sm bg-slate-50">
                       <img src={img} className="w-full h-full object-cover" />
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button onClick={() => setPreviewImage(img)} className="p-1.5 bg-white rounded-lg text-slate-800"><ExternalLink size={14}/></button>
                          {canEditCore && (
                            <button onClick={() => setRefImages(refImages.filter((_, idx) => idx !== i))} className="p-1.5 bg-red-500 rounded-lg text-white"><Trash2 size={14}/></button>
                          )}
                       </div>
                    </div>
                  ))}
                  {refImages.length === 0 && (
                    <div className="col-span-3 py-10 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-300">
                       <ImageIcon size={32} className="mb-2 opacity-50" />
                       <span className="text-sm font-medium">ไม่มีรูปภาพอ้างอิง</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 mt-4">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <LinkIcon size={12} className="text-blue-500" /> ลิงก์อ้างอิง (Reference URL)
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="url"
                      value={formData.RefURL}
                      onChange={e => setFormData({...formData, RefURL: e.target.value})}
                      placeholder="https://..."
                      className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                      readOnly={!canEditCore}
                    />
                    {formData.RefURL && (
                      <a 
                        href={formData.RefURL} 
                        target="_blank" 
                        rel="noreferrer"
                        className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
                      >
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </div>
                </div>
              </section>

              {/* Assignments & Dates */}
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50/80 p-6 rounded-3xl border border-slate-100">
                 <div className="space-y-4">
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <User size={14} className="text-indigo-500" />
                        ผู้ได้รับมอบหมาย
                      </label>
                       {canEditCore ? (
                        <div className="flex flex-wrap gap-2">
                           {allUsers.filter(u => u.Role === 'Staff').map(u => (
                             <button 
                              key={u.ID}
                              type="button"
                              onClick={() => {
                                const news = formData.Assignees.includes(u.ID) ? formData.Assignees.filter(id => id !== u.ID) : [...formData.Assignees, u.ID];
                                setFormData({...formData, Assignees: news});
                              }}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl text-xs font-bold border transition-all ${formData.Assignees.includes(u.ID) ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'}`}
                             >
                               <div className={`w-5 h-5 rounded-full overflow-hidden flex items-center justify-center shrink-0 ${formData.Assignees.includes(u.ID) ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>
                                 {u.ProfileImage ? (
                                   <img src={u.ProfileImage} className="w-full h-full object-cover" alt="" />
                                 ) : (
                                   <span className="text-[10px]">{u.Name?.charAt(0)}</span>
                                 )}
                               </div>
                               {u.Name}
                             </button>
                           ))}
                        </div>
                      ) : (
                        <div className="flex -space-x-2">
                           {formData.Assignees.map(id => {
                             const u = allUsers.find(cu => String(cu.ID) === String(id));
                             return (
                                <div key={id} className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center overflow-hidden" title={u?.Name}>
                                  {u?.ProfileImage ? (
                                    <img src={u.ProfileImage} className="w-full h-full object-cover" alt="" />
                                  ) : (
                                    <span className="text-[10px] font-bold text-blue-600">{u?.Name?.charAt(0)}</span>
                                  )}
                                </div>
                             );
                           })}
                        </div>
                      )}
                    </div>

                    {canEditCore && (
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">ระบุสีของ Card (Palette)</label>
                        <div className="flex flex-wrap gap-2">
                          {BRIEFING_PALETTE.map(c => (
                            <button
                              key={c.hex}
                              type="button"
                              onClick={() => setFormData({ ...formData, CardColor: c.hex })}
                              className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 flex items-center justify-center ${formData.CardColor === c.hex ? 'border-blue-500 ring-2 ring-blue-200' : 'border-white'}`}
                              style={{ backgroundColor: c.hex }}
                              title={c.name}
                            >
                              {formData.CardColor === c.hex && (
                                <div className={`w-1.5 h-1.5 rounded-full bg-${c.text === 'white' ? 'white' : 'slate-900'}`} />
                              )}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, CardColor: '' })}
                            className={`w-8 h-8 rounded-full border-2 border-slate-200 bg-white text-slate-400 flex items-center justify-center text-[8px] transition-all ${!formData.CardColor ? 'border-blue-500 ring-2 ring-blue-200 text-blue-500' : ''}`}
                            title="ล้างสี"
                          >
                            ล้าง
                          </button>
                        </div>
                      </div>
                    )}
                 </div>

                   <div className="flex gap-4 items-end">
                    {canEditCore && (
                      <button 
                        onClick={handleSaveBriefing}
                        disabled={saving}
                        className={`w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 h-fit ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />} 
                        {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลบรีฟ'}
                      </button>
                    )}
                  </div>
              </section>
            </div>

            {/* Right Column: Responses (Assignee Interaction) */}
            <div className={`lg:col-span-5 border-l border-slate-100 pl-4 space-y-8 transition-all duration-300 relative ${focusedSide === 'left' ? 'opacity-30 blur-[2px]' : ''}`}>
               {focusedSide === 'left' && <div className="absolute inset-0 z-10 cursor-pointer rounded-2xl" onClick={() => setFocusedSide('right')} title="คลิกเพื่อตรวจงาน/คุยกับผู้รับผิดชอบ" />}
               
               <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">สถานะและความคืบหน้า</h3>
               
               {/* Assignee Selection Tabs */}
               <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {formData.Assignees.map(id => {
                    const u = allUsers.find(cu => String(cu.ID) === String(id));
                    const resp = responses.find(r => String(r.UserID) === String(id));
                    const isDone = resp?.Status === 'เสร็จสิ้น';
                    return (
                      <button 
                        key={id} 
                        onClick={() => { setSelectedAssigneeId(String(id)); setReviewerNote(''); setReviewerImages([]); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-2xl border shrink-0 transition-all ${selectedAssigneeId === String(id) ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm ring-1 ring-indigo-200' : 'bg-white border-slate-200 text-slate-400'}`}
                      >
                        <div className={`w-2 h-2 rounded-full ${isDone ? 'bg-green-500' : 'bg-slate-300'}`} />
                        <span className="text-xs font-bold uppercase tracking-tight">{u?.Name?.split(' ')[0]}</span>
                      </button>
                    );
                  })}
               </div>

               {isLoadingResponses ? (
                  <div className="space-y-6 animate-pulse p-4">
                    <div className="h-4 w-3/4 bg-slate-100 rounded-full mb-4"></div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="aspect-square bg-slate-50 rounded-xl"></div>
                      <div className="aspect-square bg-slate-50 rounded-xl"></div>
                      <div className="aspect-square bg-slate-50 rounded-xl"></div>
                    </div>
                  </div>
               ) : (formData.Assignees.length === 0 || !selectedAssigneeId) ? (
                  <div className="text-center py-20 bg-slate-50/50 rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center">
                    <User size={48} className="mx-auto mb-4 opacity-20 text-slate-400" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">ยังไม่มีข้อมูล</p>
                    <p className="text-xs text-slate-300 mt-2 font-medium">กรุณามอบหมายงานให้พนักงานก่อน</p>
                  </div>
                ) : selectedAssigneeId ? (
                 <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">


                    {/* Result Form (Edit if me, View if other) */}
                    {(String(user?.ID) === selectedAssigneeId) ? (
                      <div className="space-y-6">
                        <section className="space-y-3">
                           <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                             <UploadCloud size={14} className="text-blue-500" /> แนบหลักฐานการทำ (MAX 6)
                           </label>
                           <div className="grid grid-cols-3 gap-2">
                              {myResponse.ResultImages.map((img, i) => (
                                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group">
                                  <img src={img} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(img)} />
                                  <button onClick={() => setMyResponse({...myResponse, ResultImages: myResponse.ResultImages.filter((_, idx) => idx !== i)})} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"><X size={10}/></button>
                                </div>
                              ))}
                              {myResponse.ResultImages.length < 6 && (
                                <label className="aspect-square border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-400 cursor-pointer transition-all">
                                  <Plus size={24} />
                                  <input type="file" multiple accept="image/*" className="hidden" onChange={handleResultImageAdd} />
                                </label>
                              )}
                           </div>
                        </section>

                        <section className="space-y-3">
                           <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                             <LinkIcon size={14} className="text-blue-500" /> ลิงก์ที่เกี่ยวข้อง (URLs)
                           </label>
                           <input type="url" value={myResponse.URL1} onChange={e => setMyResponse({...myResponse, URL1: e.target.value})} placeholder="ลิงก์ที่ 1" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20" />
                           <input type="url" value={myResponse.URL2} onChange={e => setMyResponse({...myResponse, URL2: e.target.value})} placeholder="ลิงก์ที่ 2" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20" />
                        </section>

                        <section className="space-y-3">
                           <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                             <CheckCircle2 size={14} className="text-green-500" /> สถานะของคุณ
                           </label>
                             <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                               {['รอดำเนินการ', 'กำลังทำ', 'รอตรวจ', 'รอแก้ไข', 'เสร็จสิ้น'].map(s => {
                                 const isActive = myResponse.Status === s;
                                 return (
                                   <div 
                                    key={s} 
                                    className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center ${isActive ? ACTIVE_COLORS[s] : 'bg-slate-50 border-slate-100 text-slate-300'}`}
                                   >
                                     {isActive && <div className="w-1 h-1 rounded-full bg-white mr-1.5 animate-pulse" />}
                                     {s}
                                   </div>
                                 );
                               })}
                             </div>
                        </section>

                        <section className="space-y-3">
                           <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                             <NotebookTabs size={14} className="text-blue-500" /> บันทึก/หมายเหตุของคุณ
                           </label>
                           <textarea 
                            value={myResponse.Note} 
                            onChange={e => setMyResponse({...myResponse, Note: e.target.value})} 
                            placeholder="ใส่หมายเหตุ หรือรายละเอียดการส่งงาน..." 
                            className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20" 
                           />
                        </section>

                        {selectedResponse && Object.keys(selectedResponse).some(k => k.startsWith('ReviewImage') && selectedResponse[k] && selectedResponse[k].trim() !== '') && (
                          <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl space-y-3">
                            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-2">
                              <AlertCircle size={12} /> หมายเหตุประกอบจากผู้ตรวจ (Reviewer Feedback)
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              {[1,2,3,4,5,6].map(i => {
                                const url = selectedResponse[`ReviewImage${i}`];
                                if (!url || url.trim() === '') return null;
                                return (
                                  <div key={i} className="aspect-square rounded-xl overflow-hidden border border-amber-200/50 cursor-pointer shadow-sm" onClick={() => setPreviewImage(url)}>
                                     <img src={url} alt="" className="w-full h-full object-cover" />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                         <button 
                          onClick={handleSaveResponse}
                          disabled={saving}
                          className={`w-full flex items-center justify-center gap-2 px-6 py-4 bg-green-600 text-white rounded-2xl font-bold shadow-lg shadow-green-100 hover:bg-green-700 transition-all active:scale-95 ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                          {saving ? 'กำลังบันทึก...' : 'อัปเดตการทำงานของฉัน'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {selectedResponse ? (
                          <>
                            <div className="space-y-3">
                               <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ไฟล์ส่งมอบ</p>
                               <div className="grid grid-cols-3 gap-2">
                                  {[1,2,3,4,5,6].map(i => {
                                    const url = selectedResponse[`ResultImage${i}`];
                                    if (!url) return null;
                                    return (
                                      <div key={i} className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-white">
                                         <img src={url} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(url)} />
                                      </div>
                                    );
                                  })}
                               </div>
                            </div>
                            {(selectedResponse.URL1 || selectedResponse.URL2) && (
                              <div className="space-y-2">
                                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ลิงก์แนบ</p>
                                 {selectedResponse.URL1 && <a href={selectedResponse.URL1} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 text-xs font-bold bg-blue-50 p-2 rounded-lg hover:underline"><ExternalLink size={12}/> {selectedResponse.URL1}</a>}
                                 {selectedResponse.URL2 && <a href={selectedResponse.URL2} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 text-xs font-bold bg-blue-50 p-2 rounded-lg hover:underline"><ExternalLink size={12}/> {selectedResponse.URL2}</a>}
                              </div>
                            )}
                            
                            {Object.keys(selectedResponse).some(k => k.startsWith('ReviewImage') && selectedResponse[k] && selectedResponse[k].trim() !== '') && (
                              <div className="space-y-3">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ภาพประกอบการตรวจจากแอดมิน</p>
                                <div className="grid grid-cols-3 gap-2">
                                  {[1,2,3,4,5,6].map(i => {
                                    const url = selectedResponse[`ReviewImage${i}`];
                                    if (!url || url.trim() === '') return null;
                                    return (
                                      <div key={i} className="aspect-square rounded-xl overflow-hidden border border-slate-200 cursor-pointer bg-white" onClick={() => setPreviewImage(url)}>
                                         <img src={url} alt="" className="w-full h-full object-cover" />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {selectedResponse.Note && (
                              <div className="space-y-2">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">หมายเหตุจากผู้ปฏิบัติงาน</p>
                                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm text-slate-700 whitespace-pre-wrap">
                                  {selectedResponse.Note}
                                </div>
                              </div>
                            )}



                            {canEditCore && String(user?.ID) !== String(selectedAssigneeId) && (
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">หมายเหตุผู้ตรวจ (Admin Note)</p>
                                  <textarea 
                                    value={reviewerNote}
                                    onChange={e => setReviewerNote(e.target.value)}
                                    placeholder="พิมพ์หมายเหตุ การสั่งแก้ไข หรือคำชมที่นี่..."
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                    <UploadCloud size={14} className="text-blue-500" /> แนบภาพประกอบการตรวจ (MAX 6)
                                  </label>
                                  <div className="grid grid-cols-3 gap-2">
                                    {reviewerImages.map((img, i) => (
                                      <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group">
                                        <img src={img} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(img)} />
                                        <button onClick={() => setReviewerImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                                          <X size={10}/>
                                        </button>
                                      </div>
                                    ))}
                                    {reviewerImages.length < 6 && (
                                      <label className={`${reviewerImages.length === 0 ? 'col-span-3 py-6' : 'aspect-square'} border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-500 cursor-pointer transition-all`}>
                                        {reviewerImages.length === 0 ? (
                                          <>
                                            <ImageIcon size={24} className="mb-2 opacity-30" />
                                            <p className="text-xs font-medium text-center">คลิกเลือกรูป / Ctrl+V / ลากวาง<br/>(จำกัด 6 รูป)</p>
                                          </>
                                        ) : (
                                          <Plus size={24} />
                                        )}
                                        <input 
                                          type="file" 
                                          multiple 
                                          accept="image/*" 
                                          className="hidden" 
                                          onChange={async (e) => {
                                            const files = Array.from(e.target.files);
                                            if (!files.length) return;
                                            if (reviewerImages.length + files.length > 6) {
                                              toast.error('แนบรูปได้สูงสุด 6 รูปเท่านั้น');
                                              return;
                                            }
                                            const processed = await Promise.all(files.map(processImage));
                                            setReviewerImages(prev => [...prev, ...processed]);
                                          }} 
                                        />
                                      </label>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                               <div>
                                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">สถานะ</p>
                                 <p className="text-sm font-bold text-slate-700">{selectedResponse.Status}</p>
                               </div>
                               <div className="flex gap-2">
                                 {canEditCore && (
                                   <button 
                                     onClick={async () => {
                                       setSaving(true);
                                       try {
                                         let finalNote = selectedResponse.Note || '';
                                         const timestamp = format(new Date(), 'd MMM yy HH:mm', { locale: th });
                                         if (reviewerNote.trim()) finalNote += `\n\n[สั่งแก้ไขโดย ${user?.Name} ${timestamp}]: ${reviewerNote.trim()}`;
                                         
                                         const updateData = {
                                           ...selectedResponse,
                                           Status: 'รอแก้ไข',
                                           Note: finalNote
                                         };
                                         reviewerImages.forEach((img, i) => {
                                           updateData[`ReviewImage${i + 1}`] = img;
                                         });

                                          await apiService.saveBriefingResponse(updateData);
                                          toast.success(`สั่งแก้ไขงานของ ${selectedUserInfo?.Name} แล้ว`, { position: 'bottom-right' });
                                          setReviewerNote('');
                                          setReviewerImages([]);
                                          await triggerAutoOverallStatus('รอแก้ไข');
                                          loadResponses();
                                          onSaved();
                                        } catch (e) {
                                          toast.error('ล้มเหลว: ' + e.message, { position: 'bottom-right' });
                                        } finally {
                                          setSaving(false);
                                        }
                                     }}
                                     className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-amber-200 hover:bg-amber-600 transition-all active:scale-95"
                                   >
                                     <AlertCircle size={14} /> สั่งแก้ไข
                                   </button>
                                 )}
                                 {canEditCore && (
                                   <button 
                                     onClick={async () => {
                                       setSaving(true);
                                       try {
                                         let finalNote = selectedResponse.Note || '';
                                         const timestamp = format(new Date(), 'd MMM yy HH:mm', { locale: th });
                                         if (reviewerNote.trim()) finalNote += `\n\n[อนุมัติผ่านโดย ${user?.Name} ${timestamp}]: ${reviewerNote.trim()}`;

                                         const updateData = {
                                           ...selectedResponse,
                                           Status: 'เสร็จสิ้น',
                                           Note: finalNote
                                         };
                                         reviewerImages.forEach((img, i) => {
                                           updateData[`ReviewImage${i + 1}`] = img;
                                         });

                                          await apiService.saveBriefingResponse(updateData);
                                          toast.success(`อนุมัติงานของ ${selectedUserInfo?.Name} แล้ว`, { position: 'bottom-right' });
                                          setReviewerNote('');
                                          setReviewerImages([]);
                                          await triggerAutoOverallStatus('เสร็จสิ้น');
                                          loadResponses();
                                          onSaved();
                                        } catch (e) {
                                          toast.error('ล้มเหลว: ' + e.message, { position: 'bottom-right' });
                                        } finally {
                                          setSaving(false);
                                        }
                                     }}
                                     className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-green-200 hover:bg-green-700 transition-all active:scale-95"
                                   >
                                     <CheckCircle2 size={14} /> ผ่าน (เสร็จสิ้น)
                                   </button>
                                 )}
                               </div>
                            </div>
                          </>
                        ) : (
                          <div className="py-12 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center text-slate-300">
                             <Clock size={40} className="mb-3 opacity-30" />
                             <p className="text-sm font-medium">ยังไม่มีข้อมูลการส่งงาน</p>
                          </div>
                        )}
                      </div>
                    )}
                 </div>
               ) : (
                 <div className="text-center py-20 text-slate-400">
                    <AlertCircle size={48} className="mx-auto mb-4 opacity-20" />
                    <p>กรุณาเลือกผู้ได้รับมอบหมายเพื่อดูรายละเอียด</p>
                 </div>
               )}
            </div>
          </div>
        </div>
 


        {/* Image Preview Modal */}
        {previewImage && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 animate-in fade-in duration-200" onClick={() => setPreviewImage(null)}>
            <button className="absolute top-6 right-6 p-2 text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10">
              <X size={32} />
            </button>
            <div className="relative max-w-full max-h-full flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
               <img src={previewImage} className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
            </div>
          </div>
        )}
      </div>

       <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};
