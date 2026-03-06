import React from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';

// Create a custom input to allow full width styling including the icon
const CustomInput = React.forwardRef(({ value, onClick, className }, ref) => (
  <div className="relative w-full" onClick={onClick} ref={ref}>
    <input
      value={value}
      readOnly
      className={`w-full px-4 py-2 pl-4 pr-10 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all cursor-pointer bg-white ${className || ''}`}
      placeholder="dd/mm/yyyy"
    />
    <Calendar size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
  </div>
));

export const CustomDatePicker = ({ selectedDate, onChange, label, required, className }) => {
  // selectedDate should be in 'yyyy-mm-dd' format or a Date object
  let dateObj = null;
  if (selectedDate) {
    if (typeof selectedDate === 'string') {
      if (selectedDate.includes('T')) {
        // Let JS handle full ISO strings from the backend
        dateObj = new Date(selectedDate);
      } else {
        const parts = selectedDate.split('-');
        if (parts.length === 3) {
          // Parse as local date to avoid timezone offset issues for 'yyyy-mm-dd' strings
          dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
        } else {
          dateObj = new Date(selectedDate);
        }
      }
    } else {
      dateObj = selectedDate;
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
        customInput={<CustomInput className={className} />}
        showMonthDropdown
        showYearDropdown
        dropdownMode="select"
      />
    </div>
  );
};
