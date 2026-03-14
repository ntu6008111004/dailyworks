import React from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Calendar, X } from 'lucide-react';
import { format } from 'date-fns';

// Create a custom input to allow full width styling including the icon and clear button
const CustomInput = React.forwardRef(({ value, onClick, onClear, className, placeholder }, ref) => (
  <div className="relative w-full" ref={ref}>
    <input
      value={value}
      onClick={onClick}
      readOnly
      className={`w-full px-4 py-2 pl-4 pr-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all cursor-pointer bg-white ${className || ''}`}
      placeholder={placeholder || "dd/mm/yyyy"}
    />
    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
      {value && onClear && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="p-1 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-red-500"
          title="ล้างวันที่"
        >
          <X size={14} />
        </button>
      )}
      <Calendar size={18} className="text-slate-400 pointer-events-none" />
    </div>
  </div>
));

export const CustomDatePicker = ({ selectedDate, value, onChange, label, required, className, placeholder }) => {
  // Use 'value' if 'selectedDate' is not provided (for compatibility)
  const activeDate = selectedDate || value;

  // activeDate should be in 'yyyy-mm-dd' format or a Date object
  let dateObj = null;
  if (activeDate) {
    if (typeof activeDate === 'string') {
      if (activeDate.includes('T')) {
        // Let JS handle full ISO strings from the backend
        dateObj = new Date(activeDate);
      } else {
        const parts = activeDate.split('-');
        if (parts.length === 3) {
          // Parse as local date to avoid timezone offset issues for 'yyyy-mm-dd' strings
          dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
        } else {
          dateObj = new Date(activeDate);
        }
      }
    } else {
      dateObj = activeDate;
    }
  }

  const handleChange = (date) => {
    if (date) {
      // Formats to 'yyyy-MM-dd' to keep backward compatibility with db storage
      const defaultFormat = format(date, 'yyyy-MM-dd');
      onChange(defaultFormat);
    } else {
      onChange('');
    }
  };

  const handleClear = () => {
    onChange('');
  };

  return (
    <div className={`w-full ${className || ''}`}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <DatePicker
        selected={dateObj}
        onChange={handleChange}
        dateFormat="dd/MM/yyyy"
        customInput={
          <CustomInput 
            className={className} 
            placeholder={placeholder} 
            onClear={handleClear}
          />
        }
        showMonthDropdown
        showYearDropdown
        dropdownMode="select"
      />
    </div>
  );
};
