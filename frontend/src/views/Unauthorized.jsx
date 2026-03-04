import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Unauthorized = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="glass p-8 md:p-12 rounded-3xl max-w-md w-full text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-24 h-24 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert size={48} />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">ไม่มีสิทธิ์เข้าถึง</h1>
        <p className="text-slate-500 text-sm md:text-base leading-relaxed">
          ขออภัย คุณไม่ได้รับอนุญาตให้เข้าดูหน้านี้<br />
          กรุณาติดต่อผู้ดูแลระบบหากคุณคิดว่านี่คือข้อผิดพลาด
        </p>
        <div className="pt-4">
          <Link 
            to="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white w-full rounded-xl font-medium transition-colors shadow-sm focus:ring-4 focus:ring-blue-100"
          >
            <ArrowLeft size={20} />
            กลับสู่หน้าหลัก
          </Link>
        </div>
      </div>
    </div>
  );
};
