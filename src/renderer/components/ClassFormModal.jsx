import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { error as logError } from '@renderer/utils/logger';
import TrashIcon from './icons/TrashIcon';
import PlusIcon from './icons/PlusIcon';

// Unified time options combining prayer times and custom time
const TIME_OPTIONS = [
  { value: 'بعد صلاة الفجر', label: 'بعد صلاة الفجر', type: 'prayer' },
  { value: 'بعد صلاة العصر', label: 'بعد صلاة العصر', type: 'prayer' },
  { value: 'بعد صلاة المغرب', label: 'بعد صلاة المغرب', type: 'prayer' },
  { value: 'بعد صلاة العشاء', label: 'بعد صلاة العشاء', type: 'prayer' },
  { value: 'custom', label: 'توقيت مخصص', type: 'custom' },
];

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
        const response = await window.electronAPI.getTeachers({});
        // Extract teachers array from API response object
        const teachersArray = response && response.teachers ? response.teachers : [];
        setTeachers(teachersArray);
      } catch (error) {
        logError('Failed to fetch teachers for form', error);
        // Set empty array as fallback
        setTeachers([]);
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
      gender: 'all',
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

  const handleTimeModeChange = (index, mode, value) => {
    const newSchedule = [...formData.schedule];

    if (mode === 'prayer') {
      newSchedule[index].prayerTime = value;
      newSchedule[index].customTimeFrom = '';
      newSchedule[index].customTimeTo = '';
      newSchedule[index].time = value; // Store prayer time directly
    } else if (mode === 'custom') {
      // Handle custom time inputs
      if (value.startsWith('from')) {
        newSchedule[index].customTimeFrom = value.substring(4);
      } else if (value.startsWith('to')) {
        newSchedule[index].customTimeTo = value.substring(2);
      }

      // Format custom time for display and storage
      const from = newSchedule[index].customTimeFrom || '';
      const to = newSchedule[index].customTimeTo || '';
      newSchedule[index].time = from && to ? `${from} - ${to}` : '';
    }

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
    const dataToSave = { ...formData };

    // If teacher_id is an empty string, convert it to null. This ensures it's stored as NULL
    // in the database for optional selection, rather than an invalid foreign key like 0.
    if (dataToSave.teacher_id === '' || dataToSave.teacher_id === null) {
      dataToSave.teacher_id = null;
    }

    // Filter out empty schedule rows and serialize the array to a JSON string before saving
    const filteredSchedule = dataToSave.schedule.filter((s) => s.day && s.time);
    onSave(
      { ...dataToSave, schedule: JSON.stringify(filteredSchedule) },
      classData ? classData.id : null,
    );
  };

  return (
    <Modal show={show} onHide={handleClose} centered backdrop="static" size="xl">
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>{isEditMode ? 'تعديل الفصل الدراسي' : 'إضافة فصل جديد'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>
                اسم الفصل<span className="text-danger">*</span>
              </Form.Label>
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
                <option value="completed">منتهي</option>
              </Form.Select>
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>الفئة</Form.Label>
              <Form.Select name="gender" value={formData.gender || 'all'} onChange={handleChange}>
                <option value="all">الكل</option>
                <option value="men">رجال</option>
                <option value="women">نساء</option>
                <option value="kids">أطفال</option>
              </Form.Select>
            </Form.Group>
          </Row>
          <div className="mb-3">
            <h5 className="form-section-title mb-3 text-primary">الجدول الزمني</h5>
            <div className="study-times-section">
              {formData.schedule?.map((item, index) => (
                <div
                  key={index}
                  className="schedule-card mb-3 p-3 border rounded"
                  style={{
                    border: '1px solid #e1e5e9',
                    borderRadius: '8px',
                    backgroundColor: '#fafbfc',
                  }}
                >
                  <Row className="g-2 align-items-center">
                    <Col lg={3} md={3}>
                      <Form.Group>
                        <Form.Label className="small text-muted mb-1">اليوم</Form.Label>
                        <Form.Select
                          value={item.day}
                          onChange={(e) => handleScheduleChange(index, 'day', e.target.value)}
                          style={{
                            fontSize: '14px',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            backgroundPosition: 'left 0.75rem center',
                            direction: 'rtl',
                          }}
                        >
                          <option value="">اختر يوماً</option>
                          {daysOfWeek.map((day) => (
                            <option key={day.key} value={day.key}>
                              {day.label}
                            </option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                    <Col lg={7} md={7}>
                      <Form.Group>
                        <Form.Label className="small text-muted mb-2">وقت الحصة</Form.Label>
                        <div className="d-flex flex-wrap gap-1 mb-2">
                          {TIME_OPTIONS.filter((option) => option.type === 'prayer').map(
                            (option) => (
                              <Button
                                key={option.value}
                                type="button"
                                variant={
                                  item.prayerTime === option.value ? 'primary' : 'outline-secondary'
                                }
                                size="sm"
                                onClick={() => handleTimeModeChange(index, 'prayer', option.value)}
                                style={{
                                  fontSize: '12px',
                                  padding: '6px 12px',
                                  borderRadius: '16px',
                                  border: '1px solid #e1e5e9',
                                  fontWeight: '500',
                                  background:
                                    item.prayerTime === option.value ? '#3b82f6' : '#f8f9fa',
                                  color: item.prayerTime === option.value ? 'white' : '#6c757d',
                                  transform:
                                    item.prayerTime === option.value ? 'scale(1.02)' : 'scale(1)',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                {option.label}
                              </Button>
                            ),
                          )}
                          <Button
                            type="button"
                            variant={item.timeMode === 'custom' ? 'success' : 'outline-secondary'}
                            size="sm"
                            onClick={() => handleScheduleChange(index, 'timeMode', 'custom')}
                            style={{
                              fontSize: '12px',
                              padding: '6px 12px',
                              borderRadius: '16px',
                              border: '1px solid #e1e5e9',
                              fontWeight: '500',
                              background: item.timeMode === 'custom' ? '#10b981' : '#f8f9fa',
                              color: item.timeMode === 'custom' ? 'white' : '#6c757d',
                              transform: item.timeMode === 'custom' ? 'scale(1.02)' : 'scale(1)',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <i className="fas fa-clock me-1" style={{ fontSize: '10px' }}></i>
                            مخصص
                          </Button>
                        </div>
                      </Form.Group>

                      {/* Custom time inputs with smooth animation */}
                      <div
                        className={`time-input-container ${item.timeMode === 'custom' ? 'show' : ''}`}
                        style={{
                          transition: 'all 0.3s ease',
                          opacity: item.timeMode === 'custom' ? 1 : 0,
                          maxHeight: item.timeMode === 'custom' ? '120px' : '0',
                          overflow: 'hidden',
                        }}
                      >
                        <Row className="g-2 mt-2">
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label className="small text-muted mb-1">من</Form.Label>
                              <Form.Control
                                type="time"
                                value={item.customTimeFrom || ''}
                                onChange={(e) =>
                                  handleTimeModeChange(index, 'custom', `from${e.target.value}`)
                                }
                                style={{
                                  fontSize: '14px',
                                  padding: '8px 12px',
                                  borderRadius: '6px',
                                  border: '1px solid #d1d5db',
                                }}
                              />
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group>
                              <Form.Label className="small text-muted mb-1">إلى</Form.Label>
                              <Form.Control
                                type="time"
                                value={item.customTimeTo || ''}
                                onChange={(e) =>
                                  handleTimeModeChange(index, 'custom', `to${e.target.value}`)
                                }
                                style={{
                                  fontSize: '14px',
                                  padding: '8px 12px',
                                  borderRadius: '6px',
                                  border: '1px solid #d1d5db',
                                }}
                              />
                            </Form.Group>
                          </Col>
                        </Row>
                      </div>
                    </Col>
                    <Col lg={2} md={2} className="d-flex align-items-center justify-content-end">
                      {formData.schedule.length > 1 && (
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => removeScheduleRow(index)}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0',
                            fontSize: '12px',
                          }}
                        >
                          <TrashIcon />
                        </Button>
                      )}
                    </Col>
                  </Row>
                  {item.time && (
                    <Row className="mt-2">
                      <Col>
                        <div
                          className="selected-time-display"
                          style={{
                            backgroundColor: '#e3f2fd',
                            border: '1px solid #2196f3',
                            borderRadius: '6px',
                            padding: '6px 10px',
                          }}
                        >
                          <small
                            className="d-flex align-items-center text-primary"
                            style={{ fontSize: '12px' }}
                          >
                            <i
                              className="fas fa-check-circle me-1"
                              style={{ fontSize: '10px' }}
                            ></i>
                            الوقت المحدد: <strong className="ms-1">{item.time}</strong>
                          </small>
                        </div>
                      </Col>
                    </Row>
                  )}
                </div>
              ))}
            </div>
          </div>
          <Button variant="outline-primary" size="sm" onClick={addScheduleRow} className="mt-2">
            <PlusIcon /> إضافة توقيت آخر
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
