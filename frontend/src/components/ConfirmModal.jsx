import React from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';

export const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, type = 'danger', closeOnOutsideClick = true }) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (closeOnOutsideClick && e.target === e.currentTarget) {
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
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-center mb-4">
          <div className={`p-4 rounded-full ${type === 'danger' ? 'bg-red-50' : type === 'success' ? 'bg-green-50' : 'bg-blue-50'}`}>
            {icons[type]}
          </div>
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-500 mb-6">{message}</p>
        
        <div className="flex gap-3 justify-center">
          <button
            onClick={onClose}
            className="flex-1 px-5 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={`flex-1 px-5 py-2.5 text-sm font-medium text-white rounded-xl transition-colors shadow-sm focus:ring-4 ${colors[type]}`}
          >
            ตกลง
          </button>
        </div>
      </div>
    </div>
  );
};
