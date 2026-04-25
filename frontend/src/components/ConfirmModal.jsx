import React from 'react';
import { AlertTriangle, CheckCircle, Info, RefreshCw } from 'lucide-react';

export const ConfirmModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  type = 'danger', 
  isLoading = false,
  closeOnOutsideClick = true 
}) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (!isLoading && closeOnOutsideClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  const icons = {
    danger: <AlertTriangle className="text-red-500 w-12 h-12" />,
    success: <CheckCircle className="text-green-500 w-12 h-12" />,
    info: <Info className="text-blue-500 w-12 h-12" />
  };

  const colors = {
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-100',
    success: 'bg-green-600 hover:bg-green-700 focus:ring-green-100',
    info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-100'
  };

  return (
    <div 
      className="ios-glass-overlay p-4 !z-[70]"
      onClick={handleBackdropClick}
    >
      <div className="ios-glass-card w-full max-w-sm p-8 text-center relative">
        {/* Glow Accent */}
        <div className={`absolute top-0 inset-x-0 h-1.5 ${type === 'danger' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500'} opacity-50`} />

        <div className="flex justify-center mb-5">
          <div className={`p-4 rounded-3xl ${type === 'danger' ? 'bg-red-500/10 text-red-600' : type === 'success' ? 'bg-green-500/10 text-green-600' : 'bg-blue-500/10 text-blue-600'} border border-current/10 shadow-inner`}>
            {React.cloneElement(icons[type], { size: 36, className: "" })}
          </div>
        </div>
        <h3 className="text-2xl font-black text-slate-800 mb-2">{title}</h3>
        <p className="text-slate-600 font-medium mb-8 leading-relaxed px-2">{message}</p>
        
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-6 py-3.5 text-sm font-bold text-slate-500 ios-glass-pill hover:bg-white/40 transition-all disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 px-6 py-3.5 text-sm font-black text-white rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 ${colors[type]}`}
          >
            {isLoading ? <RefreshCw size={18} className="animate-spin" /> : null}
            {isLoading ? 'รอสักครู่...' : 'ยืนยัน'}
          </button>
        </div>
      </div>
    </div>
  );
};
