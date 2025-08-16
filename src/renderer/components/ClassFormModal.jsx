import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';

const daysOfWeek = [
  { key: 'Monday', label: 'الإثنين' },
  { key: 'Tuesday', label: 'الثلاثاء' },
  { key: 'Wednesday', label: 'الأربعاء' },
  { key: 'Thursday', label: 'الخميس' },
  { key: 'Friday', label: 'الجمعة' },
  { key: 'Saturday', label: 'السبت' },
  { key: 'Sunday', label: 'الأحد' },
];

function ClassFormModal({ show, handleClose, onSave, classData }) {
  const [formData, setFormData] = useState({});
  const [teachers, setTeachers] = useState([]);
  const isEditMode = !!classData;

  useEffect(() => {
    // Fetch the list of teachers to populate the dropdown
    const fetchTeachers = async () => {
      try {
        // Use the new, secure API to get all teachers without filters.
        // The empty object {} means no filters are applied.
        const teacherList = await window.electronAPI.getTeachers({});
        setTeachers(teacherList);
      } catch (error) {
        console.error('Failed to fetch teachers for form', error);
      }
    };

    if (show) {
      fetchTeachers();
    }
  }, [show]);

  useEffect(() => {
    const initialData = {
      name: '',
      teacher_id: '',
      schedule: [{ day: '', time: '' }], // Start with one empty schedule row
      start_date: '',
      end_date: '',
      status: 'pending',
      capacity: '',
      class_type: '',
    };

    if (isEditMode && classData) {
      // Format date fields for the input controls, which expect 'YYYY-MM-DD'
      const start = classData.start_date
        ? new Date(classData.start_date).toISOString().split('T')[0]
        : '';
      const end = classData.end_date
        ? new Date(classData.end_date).toISOString().split('T')[0]
        : '';

      setFormData({
        ...initialData,
        ...classData,
        start_date: start,
        end_date: end,
        // Ensure schedule is an array, even if it's empty or null from the DB
        schedule:
          classData.schedule && classData.schedule !== '[]'
            ? JSON.parse(classData.schedule)
            : [{ day: '', time: '' }],
      });
    } else {
      setFormData(initialData);
    }
  }, [classData, show, isEditMode]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleScheduleChange = (index, field, value) => {
    const newSchedule = [...formData.schedule];
    newSchedule[index][field] = value;
    setFormData((prev) => ({ ...prev, schedule: newSchedule }));
  };

  const addScheduleRow = () => {
    setFormData((prev) => ({ ...prev, schedule: [...prev.schedule, { day: '', time: '' }] }));
  };

  const removeScheduleRow = (index) => {
    const newSchedule = formData.schedule.filter((_, i) => i !== index);
    setFormData((prev) => ({ ...prev, schedule: newSchedule }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Filter out empty schedule rows and serialize the array to a JSON string before saving
    const filteredSchedule = formData.schedule.filter((s) => s.day && s.time);
    onSave(
      { ...formData, schedule: JSON.stringify(filteredSchedule) },
      classData ? classData.id : null,
    );
  };

  return (
    <Modal show={show} onHide={handleClose} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>{isEditMode ? 'تعديل الفصل الدراسي' : 'إضافة فصل جديد'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>اسم الفصل</Form.Label>
              <Form.Control
                type="text"
                name="name"
                value={formData.name || ''}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>نوع الفصل</Form.Label>
              <Form.Control
                type="text"
                name="class_type"
                value={formData.class_type || ''}
                onChange={handleChange}
                placeholder="مثال: حفظ، تجويد"
              />
            </Form.Group>
          </Row>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>المعلم المسؤول</Form.Label>
              <Form.Select
                name="teacher_id"
                value={formData.teacher_id || ''}
                onChange={handleChange}
              >
                <option value="">اختر معلماً...</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>الحالة</Form.Label>
              <Form.Select
                name="status"
                value={formData.status || 'pending'}
                onChange={handleChange}
              >
                <option value="pending">قيد الانتظار</option>
                <option value="active">نشط</option>
                <option value="completed">مكتمل</option>
              </Form.Select>
            </Form.Group>
          </Row>
          <h5 className="form-section-title">الجدول الزمني</h5>
          <Form.Label>أوقات الدراسة</Form.Label>
          {formData.schedule?.map((item, index) => (
            <div key={index} className="schedule-row mb-2">
              <Form.Select
                value={item.day}
                onChange={(e) => handleScheduleChange(index, 'day', e.target.value)}
              >
                <option value="">اختر يوماً</option>
                {daysOfWeek.map((day) => (
                  <option key={day.key} value={day.key}>
                    {day.label}
                  </option>
                ))}
              </Form.Select>
              <Form.Control
                type="text"
                value={item.time}
                onChange={(e) => handleScheduleChange(index, 'time', e.target.value)}
                placeholder="الوقت (مثال: بعد العصر)"
              />
              {formData.schedule.length > 1 && (
                <Button variant="outline-danger" size="sm" onClick={() => removeScheduleRow(index)}>
                  <i className="fas fa-trash"></i>
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline-primary" size="sm" onClick={addScheduleRow} className="mt-2">
            <i className="fas fa-plus"></i> إضافة توقيت آخر
          </Button>
          <Row className="mt-3">
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>تاريخ البدء</Form.Label>
              <Form.Control
                type="date"
                name="start_date"
                value={formData.start_date || ''}
                onChange={handleChange}
              />
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>تاريخ الانتهاء</Form.Label>
              <Form.Control
                type="date"
                name="end_date"
                value={formData.end_date || ''}
                onChange={handleChange}
              />
            </Form.Group>
          </Row>
          <Form.Group as={Col} md="6" className="mb-3">
            <Form.Label>سعة الفصل (عدد الطلاب)</Form.Label>
            <Form.Control
              type="number"
              name="capacity"
              value={formData.capacity || ''}
              onChange={handleChange}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            إلغاء
          </Button>
          <Button variant="primary" type="submit">
            {isEditMode ? 'حفظ التعديلات' : 'إضافة الفصل'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export default ClassFormModal;
