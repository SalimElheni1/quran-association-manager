import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import Select from 'react-select';
import { toast } from 'react-toastify';

function StudentFormModal({ show, handleClose, onSave, student }) {
  const [formData, setFormData] = useState({});
  const isEditMode = !!student;
  const [age, setAge] = useState(null);
  const [ageCategory, setAgeCategory] = useState(null);

  const [allGroups, setAllGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);

  useEffect(() => {
    const initialData = {
      name: '',
      date_of_birth: '',
      gender: 'Male',
      address: '',
      contact_info: '',
      email: '',
      status: 'active',
      memorization_level: '',
      notes: '',
      parent_name: '',
      guardian_relation: '',
      parent_contact: '',
      guardian_email: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      health_conditions: '',
      national_id: '',
      school_name: '',
      grade_level: '',
      educational_level: '',
      occupation: '',
      civil_status: 'Single', // Default value
      related_family_members: '',
      financial_assistance_notes: '',
    };

    if (isEditMode && student) {
      // Populate form with student data, ensuring all fields are present
      setFormData({
        ...initialData,
        ...student,
        date_of_birth: student.date_of_birth
          ? new Date(student.date_of_birth).toISOString().split('T')[0]
          : '', // Format for date input
      });
    } else {
      // If adding, reset form to default values
      setFormData(initialData);
      setAge(null);
      setAgeCategory(null);
    }

    const fetchGroupsData = async () => {
      try {
        const groupsResult = await window.electronAPI.getGroups();
        if (groupsResult.success) {
          const groupOptions = groupsResult.data.map(g => ({ value: g.id, label: g.name }));
          setAllGroups(groupOptions);

          if (isEditMode && student) {
            const studentGroupsResult = await window.electronAPI.getStudentGroups(student.id);
            if (studentGroupsResult.success) {
              const studentGroupValues = studentGroupsResult.data.map(g => ({ value: g.id, label: g.name }));
              setSelectedGroups(studentGroupValues);
            } else {
              toast.error('Failed to load student groups.');
            }
          } else {
            setSelectedGroups([]);
          }
        } else {
          toast.error('Failed to load groups list.');
        }
      } catch (error) {
        toast.error('An error occurred while fetching group data.');
      }
    };

    if (show) {
      fetchGroupsData();
    }
  }, [student, show, isEditMode]);

  // Effect to update age category when date of birth changes
  useEffect(() => {
    if (formData.date_of_birth) {
      const birthDate = new Date(formData.date_of_birth);
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        calculatedAge--;
      }
      setAge(calculatedAge);

      if (calculatedAge >= 18) {
        setAgeCategory('adult');
      } else if (calculatedAge >= 13) {
        setAgeCategory('teen');
      } else {
        setAgeCategory('kid');
      }
    } else {
      setAge(null);
      setAgeCategory(null);
    }
  }, [formData.date_of_birth]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalFormData = {
      ...formData,
      groupIds: selectedGroups.map(g => g.value),
    };
    onSave(finalFormData, student ? student.id : null);
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static">
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>{isEditMode ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'}</Modal.Title>
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
          {/* Personal Info */}
          <h5 className="form-section-title">المعلومات الشخصية</h5>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3" controlId="formStudentName">
              <Form.Label>
                الاسم الكامل<span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                name="name"
                value={formData.name || ''}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3" controlId="formStudentDob">
              <Form.Label>تاريخ الميلاد</Form.Label>
              <Form.Control
                type="date"
                name="date_of_birth"
                value={formData.date_of_birth || ''}
                onChange={handleChange}
              />
            </Form.Group>
          </Row>
          <Row>
            <Form.Group as={Col} className="mb-3" controlId="formStudentGroups">
              <Form.Label>المجموعات</Form.Label>
              <Select
                isMulti
                name="groups"
                options={allGroups}
                className="basic-multi-select"
                classNamePrefix="select"
                placeholder="اختر المجموعات..."
                value={selectedGroups}
                onChange={(selectedOptions) => setSelectedGroups(selectedOptions || [])}
                noOptionsMessage={() => 'لا توجد مجموعات متاحة'}
              />
            </Form.Group>
          </Row>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3" controlId="formStudentGender">
              <Form.Label>الجنس</Form.Label>
              <Form.Select name="gender" value={formData.gender || 'Male'} onChange={handleChange}>
                <option value="Male">ذكر</option>
                <option value="Female">أنثى</option>
              </Form.Select>
            </Form.Group>
            {(ageCategory === 'teen' || ageCategory === 'adult') && (
              <Form.Group as={Col} md="6" className="mb-3" controlId="formStudentNationalId">
                <Form.Label>رقم الهوية الوطنية (CIN)</Form.Label>
                <Form.Control
                  type="text"
                  name="national_id"
                  value={formData.national_id || ''}
                  onChange={handleChange}
                  maxLength={8}
                />
              </Form.Group>
            )}
          </Row>
          <Row>
            <Form.Group as={Col} className="mb-3" controlId="formStudentAddress">
              <Form.Label>العنوان</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                name="address"
                value={formData.address || ''}
                onChange={handleChange}
              />
            </Form.Group>
          </Row>
          {(ageCategory === 'teen' || ageCategory === 'adult') && (
            <Row>
              <Form.Group as={Col} md="6" className="mb-3" controlId="formStudentContact">
                <Form.Label>رقم الهاتف (الطالب)</Form.Label>
                <Form.Control
                  type="text"
                  name="contact_info"
                  value={formData.contact_info || ''}
                  onChange={handleChange}
                  maxLength={8}
                />
              </Form.Group>
              <Form.Group as={Col} md="6" className="mb-3" controlId="formStudentEmail">
                <Form.Label>البريد الإلكتروني (الطالب)</Form.Label>
                <Form.Control
                  type="email"
                  name="email"
                  value={formData.email || ''}
                  onChange={handleChange}
                />
                <Form.Text className="text-muted">(مثال: user@example.com)</Form.Text>
              </Form.Group>
            </Row>
          )}

          <hr />

          {/* Guardian Info - For Kids between 5 and 13 */}
          {age !== null && age >= 5 && age <= 13 && (
            <>
              <h5 className="form-section-title">معلومات ولي الأمر</h5>
              <Row>
                <Form.Group as={Col} md="6" className="mb-3" controlId="formParentName">
                  <Form.Label>اسم ولي الأمر</Form.Label>
                  <Form.Control
                    type="text"
                    name="parent_name"
                    value={formData.parent_name || ''}
                    onChange={handleChange}
                  />
                </Form.Group>
                <Form.Group as={Col} md="6" className="mb-3" controlId="formGuardianRelation">
                  <Form.Label>صلة القرابة</Form.Label>
                  <Form.Control
                    type="text"
                    name="guardian_relation"
                    value={formData.guardian_relation || ''}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Row>
              <Row>
                <Form.Group as={Col} md="6" className="mb-3" controlId="formParentContact">
                  <Form.Label>رقم هاتف ولي الأمر</Form.Label>
                  <Form.Control
                    type="text"
                    name="parent_contact"
                    value={formData.parent_contact || ''}
                    onChange={handleChange}
                  />
                  <Form.Text className="text-muted">(مثال: +123456789)</Form.Text>
                </Form.Group>
                <Form.Group as={Col} md="6" className="mb-3" controlId="formGuardianEmail">
                  <Form.Label>بريد ولي الأمر الإلكتروني</Form.Label>
                  <Form.Control
                    type="email"
                    name="guardian_email"
                    value={formData.guardian_email || ''}
                    onChange={handleChange}
                  />
                  <Form.Text className="text-muted">(مثال: user@example.com)</Form.Text>
                </Form.Group>
              </Row>
              <hr />
            </>
          )}

          {/* Emergency & Health Info - For All Categories */}
          {ageCategory && (
            <>
              <h5 className="form-section-title">معلومات الطوارئ والصحة</h5>
              <Row>
                <Form.Group as={Col} md="6" className="mb-3" controlId="formEmergencyContactName">
                  <Form.Label>اسم جهة الاتصال في حالات الطوارئ</Form.Label>
                  <Form.Control
                    type="text"
                    name="emergency_contact_name"
                    value={formData.emergency_contact_name || ''}
                    onChange={handleChange}
                  />
                </Form.Group>
                <Form.Group as={Col} md="6" className="mb-3" controlId="formEmergencyContactPhone">
                  <Form.Label>رقم هاتف الطوارئ</Form.Label>
                  <Form.Control
                    type="text"
                    name="emergency_contact_phone"
                    value={formData.emergency_contact_phone || ''}
                    onChange={handleChange}
                  />
                  <Form.Text className="text-muted">(مثال: +123456789)</Form.Text>
                </Form.Group>
              </Row>
              <Row>
                <Form.Group as={Col} className="mb-3" controlId="formHealthConditions">
                  <Form.Label>الحالات الصحية (إن وجدت)</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    name="health_conditions"
                    value={formData.health_conditions || ''}
                    onChange={handleChange}
                  />
                </Form.Group>
              </Row>
              <hr />
            </>
          )}

          {/* Academic & Professional Info - Varies by age */}
          {ageCategory && (
            <>
              <h5 className="form-section-title">المعلومات الدراسية والمهنية</h5>
              {ageCategory === 'adult' && (
                <Row>
                  <Form.Group as={Col} md="6" className="mb-3" controlId="formEducationalLevel">
                    <Form.Label>المستوى التعليمي</Form.Label>
                    <Form.Control
                      type="text"
                      name="educational_level"
                      value={formData.educational_level || ''}
                      onChange={handleChange}
                    />
                  </Form.Group>
                  <Form.Group as={Col} md="6" className="mb-3" controlId="formOccupation">
                    <Form.Label>المهنة</Form.Label>
                    <Form.Control
                      type="text"
                      name="occupation"
                      value={formData.occupation || ''}
                      onChange={handleChange}
                    />
                  </Form.Group>
                </Row>
              )}
              {(ageCategory === 'kid' || ageCategory === 'teen') && (
                <Row>
                  <Form.Group as={Col} md="6" className="mb-3" controlId="formSchoolName">
                    <Form.Label>اسم المدرسة/المؤسسة</Form.Label>
                    <Form.Control
                      type="text"
                      name="school_name"
                      value={formData.school_name || ''}
                      onChange={handleChange}
                    />
                  </Form.Group>
                  <Form.Group as={Col} md="6" className="mb-3" controlId="formGradeLevel">
                    <Form.Label>المستوى الدراسي</Form.Label>
                    <Form.Control
                      type="text"
                      name="grade_level"
                      value={formData.grade_level || ''}
                      onChange={handleChange}
                    />
                  </Form.Group>
                </Row>
              )}
              <hr />
            </>
          )}

          {/* Civil & Family Status - For Adults */}
          {ageCategory === 'adult' && (
            <>
              <h5 className="form-section-title">الحالة المدنية والعائلية</h5>
              <Row>
                <Form.Group as={Col} md="6" className="mb-3" controlId="formCivilStatus">
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
              <Row>
                <Form.Group as={Col} className="mb-3" controlId="formRelatedFamily">
                  <Form.Label>أفراد العائلة المسجلون (لأغراض الخصم)</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    name="related_family_members"
                    value={formData.related_family_members || ''}
                    onChange={handleChange}
                    placeholder="مثال: الزوجة فاطمة، الابن علي"
                  />
                </Form.Group>
              </Row>
              <hr />
            </>
          )}

          {/* Association Info */}
          <h5 className="form-section-title">معلومات الجمعية</h5>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3" controlId="formStudentStatus">
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
            <Form.Group as={Col} md="6" className="mb-3" controlId="formMemorizationLevel">
              <Form.Label>مستوى الحفظ</Form.Label>
              <Form.Control
                type="text"
                name="memorization_level"
                value={formData.memorization_level || ''}
                onChange={handleChange}
                placeholder="مثال: جزء عم، سورة البقرة"
              />
            </Form.Group>
          </Row>
          <Row>
            <Form.Group as={Col} className="mb-3" controlId="formStudentNotes">
              <Form.Label>ملاحظات</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                name="notes"
                value={formData.notes || ''}
                onChange={handleChange}
              />
            </Form.Group>
          </Row>
          <Row>
            <Form.Group as={Col} className="mb-3" controlId="formFinancialNotes">
              <Form.Label>ملاحظات حول الوضع الاجتماعي/المالي</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                name="financial_assistance_notes"
                value={formData.financial_assistance_notes || ''}
                onChange={handleChange}
                placeholder="ملاحظات حول الحاجة إلى مساعدة في الرسوم، إلخ."
              />
            </Form.Group>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            إلغاء
          </Button>
          <Button variant="primary" type="submit">
            {isEditMode ? 'حفظ التعديلات' : 'إضافة الطالب'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export default StudentFormModal;
