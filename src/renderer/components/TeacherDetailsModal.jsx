import React from 'react';
import { Modal, Button, Row, Col } from 'react-bootstrap';

function DetailItem({ label, value }) {
  if (!value) return null;

  return (
    <Col md={6} className="mb-3">
      <div className="detail-item">
        <strong className="detail-label">{label}:</strong>
        <span className="detail-value">{value}</span>
      </div>
    </Col>
  );
}

function TeacherDetailsModal({ show, handleClose, teacher }) {
  if (!teacher) return null;

  const calculateAge = (dob) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="fas fa-chalkboard-teacher me-2"></i>
          تفاصيل المعلم: {teacher.name}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Personal Info */}
        <h5 className="form-section-title">المعلومات الشخصية</h5>
        <Row>
          <DetailItem label="الاسم الكامل" value={teacher.name} />
          <DetailItem label="رقم الهوية" value={teacher.national_id} />
          <DetailItem label="تاريخ الميلاد" value={teacher.date_of_birth?.split('T')[0]} />
          <DetailItem label="العمر" value={calculateAge(teacher.date_of_birth)} />
          <DetailItem label="الجنس" value={teacher.gender} />
          <DetailItem label="رقم الهاتف" value={teacher.contact_info} />
          <DetailItem label="البريد الإلكتروني" value={teacher.email} />
          <DetailItem label="العنوان" value={teacher.address} />
        </Row>

        {/* Professional Info */}
        <h5 className="form-section-title">المعلومات المهنية</h5>
        <Row>
          <DetailItem label="المستوى التعليمي" value={teacher.educational_level} />
          <DetailItem label="التخصص" value={teacher.specialization} />
          <DetailItem label="سنوات الخبرة" value={teacher.years_of_experience} />
          <DetailItem label="التفرغ" value={teacher.availability} />
          <DetailItem label="ملاحظات" value={teacher.notes} />
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          إغلاق
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default TeacherDetailsModal;
