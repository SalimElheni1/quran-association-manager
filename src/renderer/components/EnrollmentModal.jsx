import React, { useState, useEffect } from 'react';
import { Modal, Button, ListGroup, Row, Col, Spinner, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import '@renderer/styles/EnrollmentModal.css';
import { error as logError } from '@renderer/utils/logger';
import TimesCircleIcon from './icons/TimesCircleIcon';
import PlusCircleIcon from './icons/PlusCircleIcon';

/**
 * Calculate age from date of birth
 * Handles multiple date formats including timestamps
 */
function calculateAge(birthDateValue) {
  if (!birthDateValue) return null;

  let birthDate;

  if (typeof birthDateValue === 'number') {
    birthDate = new Date(birthDateValue);
  } else if (typeof birthDateValue === 'string') {
    if (birthDateValue.trim() === '') return null;

    const dateFormats = [
      birthDateValue,
      birthDateValue.replace(/\//g, '-'),
      birthDateValue.split('/').reverse().join('-'),
      birthDateValue.split('-').reverse().join('-'),
    ];

    for (const dateStr of dateFormats) {
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900) {
        birthDate = parsedDate;
        break;
      }
    }
  }

  if (!birthDate || isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age;
}

function EnrollmentModal({ show, handleClose, classData }) {
  const [enrolled, setEnrolled] = useState([]);
  const [notEnrolled, setNotEnrolled] = useState([]);
  const [loading, setLoading] = useState(false);
  const [eligibleGroups, setEligibleGroups] = useState([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState(new Set());

  // Multi-selection states for students
  const [selectedEnrolledIds, setSelectedEnrolledIds] = useState(new Set());
  const [selectedNotEnrolledIds, setSelectedNotEnrolledIds] = useState(new Set());

  const [validationWarnings, setValidationWarnings] = useState({});
  const [showValidationWarning, setShowValidationWarning] = useState(false);
  const [pendingEnrollment, setPendingEnrollment] = useState(null);
  const [showNoAgeGroupWarning, setShowNoAgeGroupWarning] = useState(false);

  useEffect(() => {
    const fetchEnrollmentData = async () => {
      if (!classData) {
        setEnrolled([]);
        setNotEnrolled([]);
        return;
      }
      setLoading(true);
      try {
        const { enrolledStudents, notEnrolledStudents, noAgeGroupWarning } =
          await window.electronAPI.getEnrollmentData({
            classId: classData.id,
            classAgeGroupId: classData.age_group_id,
          });

        // Correctly set the state from the destructured response
        setEnrolled(enrolledStudents || []);
        setNotEnrolled(notEnrolledStudents || []);

        // Show warning if age group is not set
        if (noAgeGroupWarning) {
          setShowNoAgeGroupWarning(true);
        }

        // Fetch eligible groups
        const groupsResult = await window.electronAPI.getEligibleGroupsForClass(classData.id);
        if (groupsResult.success) {
          setEligibleGroups(groupsResult.data);
        } else {
          toast.error('Failed to load eligible groups.');
        }
      } catch (err) {
        logError('Error fetching enrollment data:', err);
        toast.error('فشل في تحميل بيانات تسجيل الطلاب.');
        setEnrolled([]);
        setNotEnrolled([]);
        setEligibleGroups([]);
      } finally {
        setLoading(false);
      }
    };

    if (show) {
      fetchEnrollmentData();
      setValidationWarnings({});
      setPendingEnrollment(null);
      setShowNoAgeGroupWarning(false);
    }
  }, [show, classData]);

  // Validate student age/gender compatibility with class age group
  const validateStudentEnrollment = async (student) => {
    try {
      // Extract student data
      const studentAge = calculateAge(student.date_of_birth);
      const studentGender = student.gender;

      // Call validation with correct parameters for age group system
      const result = await window.electronAPI.validateStudentForClass(
        studentAge,
        studentGender,
        classData.age_group_id,
      );

      if (!result.success) {
        // Validation error (e.g., age group not found)
        return { isValid: false, message: result.message || 'تحذير التحقق من الصحة' };
      }

      if (result.isValid) {
        // Valid enrollment, but check for warnings
        if (result.warning) {
          // Valid but with warning (e.g., age undefined)
          return { isValid: false, message: result.warning, hasWarning: true };
        }
        return { isValid: true, message: null };
      } else {
        // Invalid enrollment
        return { isValid: false, message: result.message || 'تحذير التحقق من الصحة' };
      }
    } catch (err) {
      logError('Error validating student enrollment:', err);
      return { isValid: false, message: 'خطأ في التحقق من صحة التسجيل' };
    }
  };

  const handleEnroll = (studentToEnroll) => {
    setNotEnrolled(notEnrolled.filter((s) => s.id !== studentToEnroll.id));
    setEnrolled([...enrolled, studentToEnroll].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const handleEnrollWithValidation = async (student) => {
    if (!classData?.age_group_id) {
      // No age group set, allow direct enrollment
      handleEnroll(student);
      return;
    }

    const validation = await validateStudentEnrollment(student);
    if (validation.isValid) {
      handleEnroll(student);
      toast.success(`تم تسجيل ${student.name} بنجاح.`);
    } else {
      // Show warning modal
      setValidationWarnings({
        [student.id]: validation.message,
      });
      setPendingEnrollment(student);
      setShowValidationWarning(true);
    }
  };

  const confirmOverrideEnrollment = () => {
    if (pendingEnrollment) {
      handleEnroll(pendingEnrollment);
      toast.warning(`تم تسجيل ${pendingEnrollment.name} مع تجاوز التحقق من الصحة.`);
      setShowValidationWarning(false);
      setPendingEnrollment(null);
      setValidationWarnings({});
    }
  };

  const handleUnenroll = (studentToUnenroll) => {
    setEnrolled(enrolled.filter((s) => s.id !== studentToUnenroll.id));
    setNotEnrolled(
      [...notEnrolled, studentToUnenroll].sort((a, b) => a.name.localeCompare(b.name)),
    );
  };

  const handleGroupSelectionChange = (groupId) => {
    const newSelection = new Set(selectedGroupIds);
    if (newSelection.has(groupId)) {
      newSelection.delete(groupId);
    } else {
      newSelection.add(groupId);
    }
    setSelectedGroupIds(newSelection);
  };

  // Multi-selection handlers for student batch operations
  const handleEnrolledStudentSelection = (studentId) => {
    const newSelection = new Set(selectedEnrolledIds);
    if (newSelection.has(studentId)) {
      newSelection.delete(studentId);
    } else {
      newSelection.add(studentId);
    }
    setSelectedEnrolledIds(newSelection);
  };

  const handleNotEnrolledStudentSelection = (studentId) => {
    const newSelection = new Set(selectedNotEnrolledIds);
    if (newSelection.has(studentId)) {
      newSelection.delete(studentId);
    } else {
      newSelection.add(studentId);
    }
    setSelectedNotEnrolledIds(newSelection);
  };

  const handleBatchEnrollStudents = async () => {
    if (selectedNotEnrolledIds.size === 0) return;

    const studentsToEnroll = notEnrolled.filter((s) => selectedNotEnrolledIds.has(s.id));
    const enrolledIds = new Set(enrolled.map((s) => s.id));
    const newStudents = studentsToEnroll.filter((s) => !enrolledIds.has(s.id));

    // Validate all students if class has age_group_id
    if (classData?.age_group_id) {
      setLoading(true);
      const validationResults = {};
      let hasWarnings = false;

      for (const student of newStudents) {
        const validation = await validateStudentEnrollment(student);
        validationResults[student.id] = validation.message;
        if (!validation.isValid) {
          hasWarnings = true;
        }
      }

      setLoading(false);

      if (hasWarnings) {
        setValidationWarnings(validationResults);
        setPendingEnrollment({ students: newStudents, mode: 'batch' });
        setShowValidationWarning(true);
        return;
      }
    }

    setEnrolled((prev) => [...prev, ...newStudents].sort((a, b) => a.name.localeCompare(b.name)));
    setNotEnrolled((prev) => prev.filter((s) => !selectedNotEnrolledIds.has(s.id)));
    setSelectedNotEnrolledIds(new Set());

    toast.success(`تم تسجيل ${newStudents.length} طالب بنجاح.`);
  };

  const handleBatchUnenrollStudents = () => {
    if (selectedEnrolledIds.size === 0) return;

    const studentsToUnenroll = enrolled.filter((s) => selectedEnrolledIds.has(s.id));

    setNotEnrolled((prev) =>
      [...prev, ...studentsToUnenroll].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setEnrolled((prev) => prev.filter((s) => !selectedEnrolledIds.has(s.id)));
    setSelectedEnrolledIds(new Set());

    toast.success(`تم إلغاء تسجيل ${studentsToUnenroll.length} طالب بنجاح.`);
  };

  const handleEnrollGroups = async () => {
    if (selectedGroupIds.size === 0) return;
    setLoading(true);
    try {
      let studentsToEnroll = [];
      for (const groupId of selectedGroupIds) {
        const result = await window.electronAPI.getGroupStudents(groupId);
        if (result.success) {
          studentsToEnroll.push(...result.data);
        } else {
          toast.error(`Failed to get students for group ID ${groupId}.`);
        }
      }

      // Remove duplicates
      const uniqueStudents = Array.from(new Map(studentsToEnroll.map((s) => [s.id, s])).values());

      const enrolledIds = new Set(enrolled.map((s) => s.id));
      const newStudents = uniqueStudents.filter((s) => !enrolledIds.has(s.id));

      setEnrolled((prev) => [...prev, ...newStudents].sort((a, b) => a.name.localeCompare(b.name)));
      setNotEnrolled((prev) => prev.filter((s) => !newStudents.some((ns) => ns.id === s.id)));

      // Clear selection after enrollment
      setSelectedGroupIds(new Set());
    } catch (err) {
      logError('Error enrolling groups:', err);
      toast.error('An error occurred while enrolling groups.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const enrolledIds = enrolled.map((s) => s.id);
      await window.electronAPI.updateEnrollments(classData.id, enrolledIds);
      toast.success('تم تحديث قائمة الطلاب بنجاح!');
      handleClose();
    } catch (err) {
      logError('Error updating enrollments:', err);
      toast.error('فشل في حفظ التغييرات.');
    }
  };

  return (
    <>
      <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title>إدارة الطلاب في فصل: {classData?.name || 'غير محدد'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loading ? (
            <div className="text-center">
              <Spinner animation="border" />
            </div>
          ) : (
            <Row>
              <Col md={4}>
                <h5>الطلاب المسجلون ({enrolled.length})</h5>
                <div className="d-flex gap-1 mb-2">
                  <Button
                    variant="outline-danger"
                    size="sm"
                    disabled={selectedEnrolledIds.size === 0}
                    onClick={handleBatchUnenrollStudents}
                  >
                    إلغاء التسجيل ({selectedEnrolledIds.size})
                  </Button>
                </div>
                <ListGroup className="enrollment-list">
                  {enrolled.map((student) => (
                    <ListGroup.Item
                      key={student.id}
                      className="d-flex justify-content-between align-items-center"
                    >
                      <div className="d-flex align-items-center">
                        <Form.Check
                          type="checkbox"
                          checked={selectedEnrolledIds.has(student.id)}
                          onChange={() => handleEnrolledStudentSelection(student.id)}
                          className="me-2"
                        />
                        {student.name}
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-danger"
                        onClick={() => handleUnenroll(student)}
                      >
                        <TimesCircleIcon />
                      </Button>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </Col>
              <Col md={4}>
                <h5>الطلاب المتاحون ({notEnrolled.length})</h5>
                <div className="d-flex gap-1 mb-2">
                  <Button
                    variant="outline-success"
                    size="sm"
                    disabled={selectedNotEnrolledIds.size === 0}
                    onClick={handleBatchEnrollStudents}
                  >
                    تسجيل ({selectedNotEnrolledIds.size})
                  </Button>
                </div>
                <ListGroup className="enrollment-list">
                  {notEnrolled.map((student) => (
                    <ListGroup.Item
                      key={student.id}
                      className="d-flex justify-content-between align-items-center"
                    >
                      <div className="d-flex align-items-center">
                        <Form.Check
                          type="checkbox"
                          checked={selectedNotEnrolledIds.has(student.id)}
                          onChange={() => handleNotEnrolledStudentSelection(student.id)}
                          className="me-2"
                        />
                        {student.name}
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 text-success"
                        onClick={() => handleEnrollWithValidation(student)}
                      >
                        <PlusCircleIcon />
                      </Button>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </Col>
              <Col md={4}>
                <h5>المجموعات المتاحة ({eligibleGroups.length})</h5>
                <ListGroup className="enrollment-list">
                  {eligibleGroups.length > 0 ? (
                    eligibleGroups.map((group) => (
                      <ListGroup.Item key={group.id}>
                        <Form.Check
                          type="checkbox"
                          id={`group-${group.id}`}
                          label={`${group.name} (${group.studentCount || 0} طالب)`}
                          checked={selectedGroupIds.has(group.id)}
                          onChange={() => handleGroupSelectionChange(group.id)}
                        />
                      </ListGroup.Item>
                    ))
                  ) : (
                    <ListGroup.Item className="text-center text-muted">
                      لا توجد مجموعات متاحة لهذا الفصل
                    </ListGroup.Item>
                  )}
                </ListGroup>
                <Button
                  variant="primary"
                  className="mt-2 w-100"
                  onClick={handleEnrollGroups}
                  disabled={selectedGroupIds.size === 0}
                >
                  تسجيل المجموعات المختارة
                </Button>
              </Col>
            </Row>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            إلغاء
          </Button>
          <Button variant="primary" onClick={handleSave}>
            حفظ التغييرات
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Age/Gender Validation Warning Modal */}
      <Modal show={showValidationWarning} onHide={() => setShowValidationWarning(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>⚠️ تحذير التحقق من الصحة</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="alert alert-warning">
            <strong>تنبيه:</strong> لم يتمكن النظام من التحقق من توافق الطالب مع هذا الفصل:
          </div>

          {pendingEnrollment && pendingEnrollment.mode === 'batch' ? (
            <div>
              <h6>الطلاب الذين لم يتم التحقق منهم:</h6>
              <ListGroup>
                {pendingEnrollment.students.map((student) => (
                  <ListGroup.Item key={student.id}>
                    <strong>{student.name}</strong>
                    {validationWarnings[student.id] && (
                      <div className="text-danger small mt-1">{validationWarnings[student.id]}</div>
                    )}
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </div>
          ) : pendingEnrollment && typeof pendingEnrollment === 'object' ? (
            <div>
              <strong>الطالب:</strong> {pendingEnrollment.name}
              <div className="text-danger mt-2">{validationWarnings[pendingEnrollment.id]}</div>
            </div>
          ) : null}

          <hr />
          <p className="small text-muted">
            يمكنك تجاوز هذا التحذير إذا كنت متأكداً من أن التسجيل مناسب.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => {
              setShowValidationWarning(false);
              setPendingEnrollment(null);
              setValidationWarnings({});
            }}
          >
            إلغاء
          </Button>
          <Button variant="warning" onClick={confirmOverrideEnrollment}>
            متابعة التسجيل على أي حال
          </Button>
        </Modal.Footer>
      </Modal>

      {/* No Age Group Warning Modal */}
      <Modal show={showNoAgeGroupWarning} onHide={() => setShowNoAgeGroupWarning(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>⚠️ تحذير</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="alert alert-info">
            <strong>ملاحظة:</strong> لم يتم تعيين فئة عمرية لهذا الفصل. سيتم عرض جميع الطلاب النشطين
            دون تصفية.
          </div>
          <p className="text-muted">
            يُنصح بتعيين فئة عمرية للفصل لضمان توافق السن والجنس أثناء التسجيل.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => setShowNoAgeGroupWarning(false)}>
            حسناً
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default EnrollmentModal;
