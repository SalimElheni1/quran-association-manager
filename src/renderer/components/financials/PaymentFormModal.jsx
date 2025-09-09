import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import Select from 'react-select';
import { error as logError } from '@renderer/utils/logger';

const categoryOptions = [
  { value: 'all', label: 'الكل' },
  { value: 'men', label: 'رجال' },
  { value: 'women', label: 'نساء' },
  { value: 'kids', label: 'أطفال' },
];

function PaymentFormModal({ show, onHide, onSave, payment }) {
  const [formData, setFormData] = useState({
    student_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'Cash',
    notes: '',
  });
  const [students, setStudents] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(categoryOptions[0]);
  const [adultAgeThreshold, setAdultAgeThreshold] = useState(18);

  const isEditMode = payment != null;

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const settingsResponse = await window.electronAPI.getSettings();
        if (settingsResponse.success) {
          setAdultAgeThreshold(settingsResponse.settings.adultAgeThreshold || 18);
        }
        const studentsResult = await window.electronAPI.getStudents();
        setStudents(studentsResult);
      } catch (err) {
        logError('Failed to fetch initial data:', err);
      }
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (isEditMode) {
      setFormData({
        ...payment,
        payment_date: new Date(payment.payment_date).toISOString().split('T')[0],
      });
    } else {
      setFormData({
        student_id: '',
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'Cash',
        notes: '',
      });
    }
  }, [payment, show]);

  const filteredStudents = useMemo(() => {
    if (selectedCategory.value === 'all') {
      return students;
    }
    return students.filter((student) => {
      const age = student.date_of_birth
        ? new Date().getFullYear() - new Date(student.date_of_birth).getFullYear()
        : null;
      switch (selectedCategory.value) {
        case 'men':
          return student.gender === 'Male' && (age ? age >= adultAgeThreshold : true);
        case 'women':
          return student.gender === 'Female' && (age ? age >= adultAgeThreshold : true);
        case 'kids':
          return age ? age < adultAgeThreshold : false;
        default:
          return true;
      }
    });
  }, [students, selectedCategory, adultAgeThreshold]);

  const studentOptions = useMemo(
    () =>
      filteredStudents.map((student) => ({
        value: student.id,
        label: student.name,
      })),
    [filteredStudents],
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleStudentChange = (selectedOption) => {
    setFormData((prev) => ({ ...prev, student_id: selectedOption ? selectedOption.value : '' }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{isEditMode ? 'تعديل دفعة' : 'إضافة دفعة جديدة'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="formPaymentCategory">
            <Form.Label>الفئة</Form.Label>
            <Select
              options={categoryOptions}
              value={selectedCategory}
              onChange={setSelectedCategory}
              placeholder="اختر فئة..."
              isSearchable={false}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="formPaymentStudent">
            <Form.Label>
              الطالب<span className="text-danger">*</span>
            </Form.Label>
            <Select
              options={studentOptions}
              value={studentOptions.find((opt) => opt.value === formData.student_id)}
              onChange={handleStudentChange}
              placeholder="ابحث عن طالب..."
              isClearable
              isRtl
              isSearchable
              required
              noOptionsMessage={() => 'لا يوجد طلاب مطابقون'}
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formPaymentAmount">
            <Form.Label>
              المبلغ<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              required
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formPaymentMethod">
            <Form.Label>
              طريقة الدفع<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              as="select"
              name="payment_method"
              value={formData.payment_method}
              onChange={handleChange}
              required
            >
              <option value="Cash">نقداً</option>
              <option value="Bank Transfer">تحويل بنكي</option>
              <option value="Online">عبر الإنترنت</option>
              <option value="Other">أخرى</option>
            </Form.Control>
          </Form.Group>
          <Form.Group className="mb-3" controlId="formPaymentDate">
            <Form.Label>
              تاريخ الدفع<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="date"
              name="payment_date"
              value={formData.payment_date}
              onChange={handleChange}
              required
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formPaymentNotes">
            <Form.Label>ملاحظات</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              name="notes"
              value={formData.notes}
              onChange={handleChange}
            />
          </Form.Group>
          <div className="d-grid">
            <Button variant="primary" type="submit">
              {isEditMode ? 'حفظ التعديلات' : 'إضافة الدفعة'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

export default PaymentFormModal;
