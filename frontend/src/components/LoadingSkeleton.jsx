import React from 'react';

export const LoadingSkeleton = ({ count = 3 }) => {
  return (
    <div className="space-y-4 w-full">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass p-5 rounded-2xl border border-slate-200/60 animate-pulse flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <div className="flex items-start justify-between">
              <div className="h-6 bg-slate-200 rounded-md w-1/3"></div>
              <div className="h-6 bg-slate-200 rounded-full w-20"></div>
            </div>
            <div className="flex gap-4">
              <div className="h-4 bg-slate-200 rounded-md w-32"></div>
              <div className="h-4 bg-slate-200 rounded-md w-24"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
