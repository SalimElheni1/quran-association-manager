import React, { useState, useEffect } from 'react';
import { Modal, Button, ListGroup, Row, Col, Spinner, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import '@renderer/styles/EnrollmentModal.css';
import { error as logError } from '@renderer/utils/logger';
import TimesCircleIcon from './icons/TimesCircleIcon';
import PlusCircleIcon from './icons/PlusCircleIcon';

function EnrollmentModal({ show, handleClose, classData }) {
  const [enrolled, setEnrolled] = useState([]);
  const [notEnrolled, setNotEnrolled] = useState([]);
  const [loading, setLoading] = useState(false);
  const [eligibleGroups, setEligibleGroups] = useState([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState(new Set());

  // Multi-selection states for students
  const [selectedEnrolledIds, setSelectedEnrolledIds] = useState(new Set());
  const [selectedNotEnrolledIds, setSelectedNotEnrolledIds] = useState(new Set());

  useEffect(() => {
    const fetchEnrollmentData = async () => {
      if (!classData) {
        setEnrolled([]);
        setNotEnrolled([]);
        return;
      }
      setLoading(true);
      try {
        const { enrolledStudents, notEnrolledStudents } =
          await window.electronAPI.getEnrollmentData({
            classId: classData.id,
            classGender: classData.gender,
          });

        // Correctly set the state from the destructured response
        setEnrolled(enrolledStudents || []);
        setNotEnrolled(notEnrolledStudents || []);

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
    }
  }, [show, classData]);

  const handleEnroll = (studentToEnroll) => {
    setNotEnrolled(notEnrolled.filter((s) => s.id !== studentToEnroll.id));
    setEnrolled([...enrolled, studentToEnroll].sort((a, b) => a.name.localeCompare(b.name)));
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

  const handleBatchEnrollStudents = () => {
    if (selectedNotEnrolledIds.size === 0) return;

    const studentsToEnroll = notEnrolled.filter((s) => selectedNotEnrolledIds.has(s.id));
    const enrolledIds = new Set(enrolled.map((s) => s.id));
    const newStudents = studentsToEnroll.filter((s) => !enrolledIds.has(s.id));

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
                      onClick={() => handleEnroll(student)}
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
  );
}

export default EnrollmentModal;
