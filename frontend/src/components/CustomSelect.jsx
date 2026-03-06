import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export const CustomSelect = ({ 
  value, 
  onChange, 
  options, 
  placeholder = 'เลือก...', 
  className = '',
  label = '' 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      // If less than 250px below and more space above, drop up
      const shouldDropUp = spaceBelow < 250 && spaceAbove > spaceBelow;
      if (shouldDropUp !== dropUp) {
        setDropUp(shouldDropUp);
      }
    }
  }, [isOpen, dropUp]);

  const selectedOption = options.find(opt => 
    typeof opt === 'object' ? opt.value === value : opt === value
  );

  const displayLabel = selectedOption 
    ? (typeof selectedOption === 'object' ? selectedOption.label : selectedOption)
    : placeholder;

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm transition-all outline-none text-left
          ${isOpen ? 'ring-2 ring-blue-500 border-blue-500 shadow-sm' : 'hover:border-slate-300 hover:bg-slate-50'}
        `}
      >
        <span className={`${!selectedOption ? 'text-slate-400' : 'text-slate-900 font-medium'} truncate`}>
          {displayLabel}
        </span>
        <ChevronDown 
          size={18} 
          className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {isOpen && (
        <div 
          ref={listRef}
          className={`absolute left-0 right-0 z-[100] min-w-[200px] glass overflow-hidden rounded-2xl p-1 animate-in fade-in zoom-in-95 duration-100
            ${dropUp ? 'bottom-full mb-2' : 'top-full mt-2'}
          `}
        >
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {options.map((opt, index) => {
              const optVal = typeof opt === 'object' ? opt.value : opt;
              const optLabel = typeof opt === 'object' ? opt.label : opt;
              const isSelected = optVal === value;

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSelect(optVal)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors text-left
                    ${isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-100'}
                  `}
                >
                  <span className="truncate">{optLabel}</span>
                  {isSelected && <Check size={16} className="text-blue-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
