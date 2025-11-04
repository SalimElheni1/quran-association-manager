import React, { useState, useRef, useEffect } from 'react';
import { Form } from 'react-bootstrap';
import ChevronDownIcon from '@renderer/components/icons/ChevronDownIcon';

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
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
      setIsOpen(!isOpen);
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
      style={{
        position: 'relative',
        fontSize: '14px',
        color: '#333',
        direction: 'rtl',
      }}
    >
      <div
        className="dropdown-label"
        onClick={toggleDropdown}
        style={{
          display: 'block',
          height: '38px',
          background: '#fff',
          border: '1px solid #ccc',
          borderRadius: '4px',
          padding: '6px 12px',
          lineHeight: '1.5',
          cursor: disabled || options.length === 0 ? 'not-allowed' : 'pointer',
          opacity: disabled || options.length === 0 ? 0.6 : 1,
          textAlign: 'right',
        }}
      >
        <span>{getSelectedLabels()}</span>
        <ChevronDownIcon
          style={{
            float: 'left',
            marginTop: '2px',
            transition: 'transform 0.15s ease-in-out',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </div>

      <div
        className="dropdown-list"
        style={{
          padding: '12px',
          background: '#fff',
          position: 'absolute',
          top: '42px',
          left: '0',
          right: '0',
          boxShadow: '0 1px 2px 1px rgba(0, 0, 0, .15)',
          border: '1px solid #ccc',
          borderRadius: '4px',
          transformOrigin: '50% 0',
          transform: isOpen ? 'scale(1, 1)' : 'scale(1, 0)',
          transition: 'transform .15s ease-in-out',
          maxHeight: '300px',
          overflowY: 'auto',
          zIndex: 1000,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        {options.length > 1 && (
          <a
            href="#"
            className="dropdown-option check-all-option"
            onClick={(e) => {
              e.preventDefault();
              handleCheckAll();
            }}
            style={{
              display: 'block',
              padding: '8px 12px',
              color: '#379937',
              textDecoration: 'none',
              borderBottom: '1px solid #eee',
              marginBottom: '8px',
              textAlign: 'right',
              fontWeight: 'bold',
            }}
          >
            {areAllSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
          </a>
        )}

        {options.map((option) => {
          const isSelected = selectedValues.includes(option.value);
          return (
            <label
              key={option.value}
              className="dropdown-option"
              style={{
                display: 'block',
                padding: '8px 12px',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
                textAlign: 'right',
                opacity: isOpen ? 1 : 0,
                transitionDelay: isOpen ? '0.1s' : '0s',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f8f9fa';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => handleCheckboxChange(option.value, e.target.checked)}
                style={{
                  marginLeft: '8px',
                  marginRight: '0',
                }}
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
