import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Form, InputGroup, ListGroup, Spinner } from 'react-bootstrap';
import { useStudents } from '@renderer/hooks/useStudents';

function SearchableStudentSelect({
  value,
  onChange,
  onStudentChange,
  placeholder = 'اكتب للبحث عن طالب...',
  required,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const { students, loading, searchStudents } = useStudents();

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Handle search term changes
  const debouncedSearch = useCallback(() => {
    if (searchTerm.length >= 2) {
      searchStudents(searchTerm);
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, [searchTerm, searchStudents]);

  useEffect(() => {
    debouncedSearch();
  }, [debouncedSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Set initial value if provided
  useEffect(() => {
    if (value && typeof value === 'string' && value !== selectedStudent?.id) {
      // If value is just an ID, we need to fetch the student details
      // For now, we'll assume the display name is handled by parent component
      setSelectedStudent({ id: value });
    } else if (value && typeof value === 'object') {
      setSelectedStudent(value);
    }
  }, [value]);

  const handleInputChange = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    if (!term) {
      setSelectedStudent(null);
      onChange(null);
    }
  };

  const handleStudentSelect = (student) => {
    setSelectedStudent(student);
    setSearchTerm(`${student.matricule} - ${student.name}`);
    setShowDropdown(false);
    onChange(student.id);
    if (onStudentChange) {
      onStudentChange(student);
    }
  };

  const handleInputFocus = () => {
    if (searchTerm.length >= 2) {
      setShowDropdown(true);
    }
  };

  const getDisplayValue = () => {
    if (selectedStudent) {
      return `${selectedStudent.matricule} - ${selectedStudent.name}`;
    }
    return searchTerm;
  };

  return (
    <div style={{ position: 'relative' }}>
      <InputGroup>
        <Form.Control
          ref={inputRef}
          type="text"
          value={getDisplayValue()}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
        />
        <InputGroup.Text>
          {loading ? <Spinner animation="border" size="sm" /> : <span>🔍</span>}
        </InputGroup.Text>
      </InputGroup>

      {showDropdown && (
        <ListGroup
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 9999,
            maxHeight: '200px',
            overflowY: 'auto',
            boxShadow: '0 0.5rem 1rem rgba(0, 0, 0, 0.15)',
            border: '1px solid #dee2e6',
          }}
        >
          {students.length > 0 ? (
            students.map((student) => (
              <ListGroup.Item
                key={student.id}
                action
                onClick={() => handleStudentSelect(student)}
                style={{ cursor: 'pointer' }}
                className="text-end"
              >
                <div>
                  <strong>{student.matricule}</strong> - {student.name}
                </div>
              </ListGroup.Item>
            ))
          ) : (
            <ListGroup.Item disabled className="text-center text-muted">
              {loading ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  جاري البحث...
                </>
              ) : searchTerm.length >= 2 ? (
                'لا توجد نتائج'
              ) : (
                'اكتب المزيد من الأحرف للبحث'
              )}
            </ListGroup.Item>
          )}
        </ListGroup>
      )}
    </div>
  );
}

export default SearchableStudentSelect;
