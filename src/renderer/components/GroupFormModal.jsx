import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, Form, InputGroup, ListGroup, Badge } from 'react-bootstrap';
import { toast } from 'react-toastify';

function GroupFormModal({ show, handleClose, onSave, group }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'Kids', // Default value
  });

  const [availableStudents, setAvailableStudents] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const isEditing = !!group;

  useEffect(() => {
    if (show) {
      if (isEditing) {
        setFormData({
          name: group.name || '',
          description: group.description || '',
          category: group.category || 'Kids',
        });
        // For editing, load existing group students
        loadExistingStudents();
      } else {
        // Reset form for new group
        setFormData({
          name: '',
          description: '',
          category: 'Kids',
        });
        setSelectedStudentIds([]);
        setStudentSearch('');
      }

      // Load available students for current category
      loadAvailableStudents(formData.category);
    }
  }, [group, isEditing, show]);

  useEffect(() => {
    if (!isEditing) {
      // Load students when category changes (for new groups only)
      loadAvailableStudents(formData.category);
    }
  }, [formData.category]);

  const loadExistingStudents = async () => {
    if (!group?.id) return;
    try {
      const result = await window.electronAPI.getGroupStudents(group.id);
      if (result.success) {
        const studentIds = result.data.map((s) => s.id);
        setSelectedStudentIds(studentIds);
      }
    } catch (error) {
      console.error('Error loading existing students:', error);
    }
  };

  const loadAvailableStudents = async (category) => {
    try {
      const result = await window.electronAPI.getEligibleStudentsForGroup(category);
      if (result.success) {
        setAvailableStudents(result.data);
      } else {
        setAvailableStudents([]);
      }
    } catch (error) {
      console.error('Error loading available students:', error);
      setAvailableStudents([]);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // If category changed, reload students for new groups only
    if (name === 'category' && !isEditing) {
      loadAvailableStudents(value);
    }
  };

  const filteredAvailableStudents = useMemo(() => {
    if (!studentSearch.trim()) return availableStudents;
    const searchLower = studentSearch.toLowerCase();
    return availableStudents.filter(
      (student) =>
        student.name.toLowerCase().includes(searchLower) ||
        student.matricule.toLowerCase().includes(searchLower),
    );
  }, [availableStudents, studentSearch]);

  const selectedStudents = useMemo(() => {
    return availableStudents.filter((student) => selectedStudentIds.includes(student.id));
  }, [availableStudents, selectedStudentIds]);

  const handleStudentSelect = (studentId) => {
    const isSelected = selectedStudentIds.includes(studentId);
    if (isSelected) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, studentId]);
    }
  };

  const removeStudent = (studentId) => {
    setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId));
  };

  const clearAllStudents = () => {
    setSelectedStudentIds([]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.category) {
      toast.error('اسم المجموعة والفئة حقول إلزامية.');
      return;
    }

    // Include selected student IDs in the form data
    const groupDataWithStudents = {
      ...formData,
      studentIds: selectedStudentIds,
    };

    onSave(groupDataWithStudents, group?.id);
  };

  const groupCategories = {
    Kids: 'أطفال',
    Women: 'نساء',
    Men: 'رجال',
  };

  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{isEditing ? 'تعديل مجموعة' : 'إضافة مجموعة جديدة'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="groupName">
            <Form.Label>اسم المجموعة</Form.Label>
            <Form.Control
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="groupDescription">
            <Form.Label>الوصف</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              name="description"
              value={formData.description}
              onChange={handleChange}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="groupCategory">
            <Form.Label>الفئة</Form.Label>
            <Form.Select name="category" value={formData.category} onChange={handleChange} required>
              {Object.entries(groupCategories).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3" controlId="groupStudents">
            <Form.Label>الطلاب ({selectedStudentIds.length} طالب محدد)</Form.Label>

            {/* Selected students chips */}
            <div className="mb-2">
              {selectedStudents.length > 0 && (
                <div className="d-flex flex-wrap gap-1 mb-2">
                  {selectedStudents.map((student) => (
                    <Badge
                      key={student.id}
                      bg="primary"
                      className="d-flex align-items-center gap-1"
                      style={{ cursor: 'pointer' }}
                      onClick={() => removeStudent(student.id)}
                    >
                      {student.name}
                      <span aria-hidden="true" className="ms-1">
                        ×
                      </span>
                    </Badge>
                  ))}
                  {selectedStudents.length > 3 && (
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={clearAllStudents}
                      className="ms-2"
                    >
                      مسح الكل
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Search input for students */}
            <InputGroup className="mb-2">
              <Form.Control
                type="text"
                placeholder="البحث في الطلاب بالاسم أو الرقم..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)} // Delay to allow clicks
              />
            </InputGroup>

            {/* Available students dropdown */}
            {showDropdown &&
              availableStudents.length > 0 &&
              filteredAvailableStudents.length > 0 && (
                <ListGroup
                  style={{
                    maxHeight: '200px',
                    overflowY: 'auto',
                    border: '1px solid #dee2e6',
                    borderRadius: '0.375rem',
                  }}
                  className="mb-2"
                >
                  {filteredAvailableStudents.length > 0 ? (
                    filteredAvailableStudents.map((student) => (
                      <ListGroup.Item
                        key={student.id}
                        action
                        active={selectedStudentIds.includes(student.id)}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleStudentSelect(student.id);
                        }}
                        onMouseDown={(e) => e.preventDefault()} // Prevent blur on click
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="d-flex justify-content-between align-items-center">
                          <span>
                            {student.name} ({student.matricule})
                          </span>
                          {selectedStudentIds.includes(student.id) && <Badge bg="success">✓</Badge>}
                        </div>
                      </ListGroup.Item>
                    ))
                  ) : (
                    <ListGroup.Item disabled>لا توجد نتائج</ListGroup.Item>
                  )}
                </ListGroup>
              )}
          </Form.Group>

          <Modal.Footer>
            <Button variant="secondary" onClick={handleClose}>
              إلغاء
            </Button>
            <Button variant="primary" type="submit">
              {isEditing ? 'حفظ التعديلات' : 'إضافة المجموعة'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

export default GroupFormModal;
