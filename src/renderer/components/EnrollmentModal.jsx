import React, { useState, useEffect } from 'react';
import { Modal, Button, ListGroup, Row, Col, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import '../styles/EnrollmentModal.css';

function EnrollmentModal({ show, handleClose, classData }) {
  const [enrolled, setEnrolled] = useState([]);
  const [notEnrolled, setNotEnrolled] = useState([]);
  const [loading, setLoading] = useState(false);

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
      } catch (err) {
        console.error('Error fetching enrollment data:', err);
        toast.error('فشل في تحميل بيانات تسجيل الطلاب.');
        setEnrolled([]);
        setNotEnrolled([]);
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

  const handleSave = async () => {
    try {
      const enrolledIds = enrolled.map((s) => s.id);
      await window.electronAPI.updateEnrollments(classData.id, enrolledIds);
      toast.success('تم تحديث قائمة الطلاب بنجاح!');
      handleClose();
    } catch (err) {
      console.error('Error updating enrollments:', err);
      toast.error('فشل في حفظ التغييرات.');
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg">
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
            <Col>
              <h5>الطلاب المسجلون ({enrolled.length})</h5>
              <ListGroup className="enrollment-list">
                {enrolled.length > 0 ? (
                  enrolled.map((student) => (
                    <ListGroup.Item key={student.id}>
                      {student.name}
                      <Button
                        variant="outline-danger"
                        size="sm"
                        className="float-start"
                        onClick={() => handleUnenroll(student)}
                      >
                        <i className="fas fa-arrow-left"></i>
                      </Button>
                    </ListGroup.Item>
                  ))
                ) : (
                  <p className="text-muted">لا يوجد طلاب مسجلون.</p>
                )}
              </ListGroup>
            </Col>
            <Col>
              <h5>الطلاب غير المسجلين ({notEnrolled.length})</h5>
              <ListGroup className="enrollment-list">
                {notEnrolled.length > 0 ? (
                  notEnrolled.map((student) => (
                    <ListGroup.Item key={student.id}>
                      <Button
                        variant="outline-success"
                        size="sm"
                        className="float-end"
                        onClick={() => handleEnroll(student)}
                      >
                        <i className="fas fa-arrow-right"></i>
                      </Button>
                      {student.name}
                    </ListGroup.Item>
                  ))
                ) : (
                  <p className="text-muted">لا يوجد طلاب غير مسجلين.</p>
                )}
              </ListGroup>
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
