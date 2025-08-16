import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Form, Spinner } from 'react-bootstrap';
import '../styles/AttendancePage.css';
import { toast } from 'react-toastify';

function AttendancePage() {
  // Default to today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedClass, setSelectedClass] = useState('');
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);

  const dayNameLabel = useMemo(() => {
    if (!selectedDate) return '';
    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    // The `new Date()` constructor handles the timezone offset correctly when parsing YYYY-MM-DD
    const date = new Date(selectedDate);
    // getDay() returns the day of the week for the local time zone, which is what we want.
    const dayIndex = date.getDay();
    return `(${dayNames[dayIndex]})`;
  }, [selectedDate]);

  const fetchClassesForDate = useCallback(async () => {
    if (!selectedDate) return;
    setLoading(true);
    try {
      const fetchedClasses = await window.electronAPI.getClassesForDay(selectedDate);
      setClasses(fetchedClasses);
    } catch (err) {
      console.error('Error fetching classes for date:', err);
      toast.error('فشل في تحميل الفصول الدراسية للتاريخ المحدد.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchClassesForDate();
  }, [fetchClassesForDate]);

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setSelectedClass(''); // Reset class selection when date changes
    setStudents([]); // Clear student list
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>تسجيل الحضور</h1>
      </div>

      <div className="attendance-controls">
        <Form.Group controlId="attendanceDate">
          <Form.Label>اختر التاريخ: {dayNameLabel}</Form.Label>
          <Form.Control
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            className="date-picker"
          />
        </Form.Group>

        <Form.Group controlId="classSelect">
          <Form.Label>اختر الفصل:</Form.Label>
          <Form.Select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            disabled={loading || classes.length === 0}
          >
            <option value="">-- حدد الفصل الدراسي --</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </div>

      <div className="attendance-roster-placeholder">
        <p>الرجاء اختيار التاريخ والفصل لعرض قائمة الطلاب.</p>
      </div>
    </div>
  );
}

export default AttendancePage;
