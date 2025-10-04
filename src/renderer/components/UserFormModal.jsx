import React, { useEffect, useState } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { toast } from 'react-toastify';
import PasswordInput from '@renderer/components/PasswordInput';
import { error as logError } from '@renderer/utils/logger';

function UserFormModal({ show, handleClose, onSaveSuccess, user }) {
  const [formData, setFormData] = useState({});
  const isEditMode = !!user;

  useEffect(() => {
    const initialData = {
      username: '',
      password: '',
      first_name: '',
      last_name: '',
      date_of_birth: '',
      national_id: '',
      email: '',
      phone_number: '',
      occupation: '',
      civil_status: 'Single',
      employment_type: 'volunteer',
      start_date: '',
      end_date: '',
      roles: ['Administrator'], // Default role
      status: 'active',
      notes: '',
    };

    if (isEditMode && user) {
      // Format date fields for the input controls, which expect 'YYYY-MM-DD'
      const dob = user.date_of_birth
        ? new Date(user.date_of_birth).toISOString().split('T')[0]
        : '';
      const start = user.start_date ? new Date(user.start_date).toISOString().split('T')[0] : '';
      const end = user.end_date ? new Date(user.end_date).toISOString().split('T')[0] : '';

      setFormData({
        ...initialData,
        ...user,
        roles: user.roles || [], // Ensure roles is an array
        password: '', // Clear password on edit
        date_of_birth: dob,
        start_date: start,
        end_date: end,
      });
    } else {
      setFormData(initialData);
    }
  }, [user, show]);

  const roleOptions = {
    Superadmin: 'مدير النظام',
    Administrator: 'إداري',
    FinanceManager: 'مسؤول مالي',
    SessionSupervisor: 'مشرف حصص',
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRoleChange = (e) => {
    const { value, checked } = e.target;
    setFormData((prev) => {
      const currentRoles = prev.roles || [];
      if (checked) {
        return { ...prev, roles: [...currentRoles, value] };
      }
      return { ...prev, roles: currentRoles.filter((role) => role !== value) };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Ensure roles array is not empty
      const dataToSubmit = {
        ...formData,
        roles: formData.roles && formData.roles.length > 0 ? formData.roles : ['Administrator']
      };
      
      if (isEditMode) {
        await window.electronAPI.updateUser(user.id, dataToSubmit);
        toast.success('تم تحديث بيانات المستخدم بنجاح!');
      } else {
        await window.electronAPI.addUser(dataToSubmit);
      }
      onSaveSuccess();
    } catch (err) {
      logError('Error adding user:', err);
      const friendlyMessage = err.message.split('Error:').pop().trim();
      toast.error(friendlyMessage);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static">
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>{isEditMode ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {isEditMode && (
            <Row>
              <Form.Group as={Col} className="mb-3">
                <Form.Label>الرقم التعريفي</Form.Label>
                <Form.Control type="text" value={formData.matricule || ''} readOnly disabled />
              </Form.Group>
            </Row>
          )}
          <h5 className="form-section-title">معلومات الحساب</h5>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>
                اسم المستخدم<span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                name="username"
                value={formData.username || ''}
                onChange={handleChange}
                required
                disabled={isEditMode}
              />
              <Form.Text className="text-muted">
                (يجب أن يكون بالإنجليزية: حروف وأرقام فقط، لا يمكن تغييره بعد الإنشاء)
              </Form.Text>
            </Form.Group>
            <PasswordInput
              name="password"
              value={formData.password || ''}
              onChange={handleChange}
              placeholder={isEditMode ? 'اتركه فارغاً لعدم التغيير' : ''}
              required={!isEditMode}
              label={
                <>
                  كلمة المرور<span className="text-danger">*</span>
                </>
              }
              helpText={!isEditMode ? '(8 أحرف على الأقل)' : ''}
            />
          </Row>

          <h5 className="form-section-title">المعلومات الشخصية</h5>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>
                الاسم الأول<span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                name="first_name"
                value={formData.first_name || ''}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>
                اللقب<span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                name="last_name"
                value={formData.last_name || ''}
                onChange={handleChange}
                required
              />
            </Form.Group>
          </Row>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>تاريخ الميلاد</Form.Label>
              <Form.Control
                type="date"
                name="date_of_birth"
                value={formData.date_of_birth || ''}
                onChange={handleChange}
              />
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>
                رقم ب.ت.و<span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                name="national_id"
                value={formData.national_id || ''}
                onChange={handleChange}
                maxLength={8}
                required
              />
            </Form.Group>
          </Row>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>البريد الإلكتروني</Form.Label>
              <Form.Control
                type="email"
                name="email"
                value={formData.email || ''}
                onChange={handleChange}
              />
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>
                رقم الهاتف<span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                name="phone_number"
                value={formData.phone_number || ''}
                onChange={handleChange}
                maxLength={8}
                required
              />
            </Form.Group>
          </Row>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>الوظيفة</Form.Label>
              <Form.Control
                type="text"
                name="occupation"
                value={formData.occupation || ''}
                onChange={handleChange}
              />
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>الحالة المدنية</Form.Label>
              <Form.Select
                name="civil_status"
                value={formData.civil_status || 'Single'}
                onChange={handleChange}
              >
                <option value="Single">أعزب/عزباء</option>
                <option value="Married">متزوج/متزوجة</option>
                <option value="Divorced">مطلق/مطلقة</option>
                <option value="Widowed">أرمل/أرملة</option>
              </Form.Select>
            </Form.Group>
          </Row>

          <h5 className="form-section-title">معلومات العمل</h5>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>نوع التوظيف</Form.Label>
              <Form.Select
                name="employment_type"
                value={formData.employment_type || 'volunteer'}
                onChange={handleChange}
              >
                <option value="volunteer">متطوع</option>
                <option value="contract">بعقد</option>
              </Form.Select>
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>الأدوار في النظام</Form.Label>
              <div>
                {Object.entries(roleOptions).map(([key, label]) => (
                  <Form.Check
                    key={key}
                    type="checkbox"
                    id={`role-${key}`}
                    label={label}
                    value={key}
                    checked={formData.roles?.includes(key)}
                    onChange={handleRoleChange}
                  />
                ))}
              </div>
            </Form.Group>
            {isEditMode && (
              <Form.Group as={Col} md="6" className="mb-3">
                <Form.Label>الحالة</Form.Label>
                <Form.Select
                  name="status"
                  value={formData.status || 'active'}
                  onChange={handleChange}
                >
                  <option value="active">نشط</option>
                  <option value="inactive">غير نشط</option>
                </Form.Select>
              </Form.Group>
            )}
          </Row>
          {formData.employment_type === 'contract' && (
            <Row>
              <Form.Group as={Col} md="6" className="mb-3">
                <Form.Label>تاريخ بداية العقد</Form.Label>
                <Form.Control
                  type="date"
                  name="start_date"
                  value={formData.start_date}
                  onChange={handleChange}
                />
              </Form.Group>
              <Form.Group as={Col} md="6" className="mb-3">
                <Form.Label>تاريخ نهاية العقد (اختياري)</Form.Label>
                <Form.Control
                  type="date"
                  name="end_date"
                  value={formData.end_date}
                  onChange={handleChange}
                />
              </Form.Group>
            </Row>
          )}
          <Form.Group className="mb-3">
            <Form.Label>ملاحظات</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              name="notes"
              value={formData.notes || ''}
              onChange={handleChange}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            إلغاء
          </Button>
          <Button variant="primary" type="submit">
            {isEditMode ? 'حفظ التعديلات' : 'إضافة المستخدم'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export default UserFormModal;
