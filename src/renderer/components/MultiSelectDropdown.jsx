import React, { useState, useRef, useEffect } from 'react';
import ChevronDownIcon from '@renderer/components/icons/ChevronDownIcon';
import '@renderer/styles/MultiSelectDropdown.css';

function MultiSelectDropdown({
  options = [],
  selectedValues = [],
  onSelectionChange,
  placeholder = 'اختر الفصول الدراسية...',
  disabled = false,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleCheckboxChange = (value, checked) => {
    let newSelectedValues;
    if (checked) {
      newSelectedValues = [...selectedValues, value];
    } else {
      newSelectedValues = selectedValues.filter((v) => v !== value);
    }
    onSelectionChange(newSelectedValues);
  };

  const handleCheckAll = () => {
    const allValues = options.map((option) => option.value);
    const areAllSelected = allValues.every((value) => selectedValues.includes(value));

    if (areAllSelected) {
      // Uncheck all
      onSelectionChange([]);
    } else {
      // Check all
      onSelectionChange(allValues);
    }
  };

  const toggleDropdown = () => {
    if (!disabled && options.length > 0) {
      setIsOpen((prev) => !prev);
    }
  };

  const getSelectedLabels = () => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length === 1) {
      const option = options.find((opt) => opt.value === selectedValues[0]);
      return option ? option.label : placeholder;
    }
    if (selectedValues.length === options.length) {
      return 'الكل محدد';
    }
    return `${selectedValues.length} مختار`;
  };

  const areAllSelected =
    options.length > 0 && options.every((option) => selectedValues.includes(option.value));

  return (
    <div
      className={`checkbox-dropdown ${isOpen ? 'on' : ''} ${disabled ? 'disabled' : ''} ${className}`}
      ref={dropdownRef}
    >
      <button
        type="button"
        className="dropdown-label"
        onClick={toggleDropdown}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleDropdown();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled || options.length === 0}
        ref={triggerRef}
      >
        <span className="dropdown-label-text">{getSelectedLabels()}</span>
        <ChevronDownIcon
          className="dropdown-chevron"
          width={16}
          height={16}
        />
      </button>

      <div
        className="dropdown-list"
        role="listbox"
        aria-multiselectable="true"
      >
        {options.length > 1 && (
          <button
            type="button"
            className="dropdown-option check-all-option"
            onClick={handleCheckAll}
            role="option"
            aria-selected={areAllSelected}
          >
            {areAllSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
          </button>
        )}

        {options.map((option) => {
          const isSelected = selectedValues.includes(option.value);
          return (
            <label
              key={option.value}
              className="dropdown-option"
              role="option"
              aria-selected={isSelected}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => handleCheckboxChange(option.value, e.target.checked)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default MultiSelectDropdown;