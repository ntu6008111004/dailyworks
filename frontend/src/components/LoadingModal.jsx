import React from 'react';

export const LoadingModal = ({ isOpen, message = 'กำลังโหลด...' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl px-8 py-6 shadow-2xl text-center flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="relative flex justify-center items-center w-12 h-12">
          <div className="absolute inset-0 rounded-full border-[3px] border-slate-100"></div>
          <div className="absolute inset-0 rounded-full border-[3px] border-blue-600 border-t-transparent animate-spin"></div>
        </div>
        <p className="text-slate-700 font-medium">{message}</p>
      </div>
    </div>
  );
};
