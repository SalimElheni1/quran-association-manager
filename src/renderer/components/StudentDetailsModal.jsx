import React from 'react';
import { Modal, Button, Row, Col, Badge } from 'react-bootstrap';

function DetailItem({ label, value, isBadge = false, badgeVariant = 'secondary' }) {
  if (!value) return null;

  return (
    <Col md={6} className="mb-3">
      <div className="detail-item">
        <strong className="detail-label">{label}:</strong>
        {isBadge ? (
          <Badge bg={badgeVariant} className="p-2 detail-value">
            {value}
          </Badge>
        ) : (
          <span className="detail-value">{value}</span>
        )}
      </div>
    </Col>
  );
}

function StudentDetailsModal({ show, handleClose, student }) {
  if (!student) return null;

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

  const statusTranslations = {
    active: 'نشط',
    inactive: 'غير نشط',
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="fas fa-user-circle me-2"></i>
          تفاصيل الطالب: {student.name}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Personal Info */}
        <h5 className="form-section-title">المعلومات الشخصية</h5>
        <Row>
          <DetailItem label="الاسم الكامل" value={student.name} />
          <DetailItem label="تاريخ الميلاد" value={student.date_of_birth?.split('T')[0]} />
          <DetailItem label="العمر" value={calculateAge(student.date_of_birth)} />
          <DetailItem label="الجنس" value={student.gender} />
          <DetailItem label="رقم الهوية" value={student.national_id} />
          <DetailItem label="العنوان" value={student.address} />
          <DetailItem label="رقم الهاتف" value={student.contact_info} />
          <DetailItem label="البريد الإلكتروني" value={student.email} />
        </Row>

        {/* Guardian Info */}
        {(student.parent_name || student.parent_contact) && (
          <>
            <h5 className="form-section-title">معلومات ولي الأمر</h5>
            <Row>
              <DetailItem label="اسم ولي الأمر" value={student.parent_name} />
              <DetailItem label="صلة القرابة" value={student.guardian_relation} />
              <DetailItem label="هاتف ولي الأمر" value={student.parent_contact} />
              <DetailItem label="بريد ولي الأمر" value={student.guardian_email} />
            </Row>
          </>
        )}

        {/* Academic & Professional Info */}
        <h5 className="form-section-title">المعلومات الدراسية والمهنية</h5>
        <Row>
          <DetailItem label="المستوى التعليمي" value={student.educational_level} />
          <DetailItem label="المهنة" value={student.occupation} />
          <DetailItem label="اسم المدرسة" value={student.school_name} />
          <DetailItem label="المستوى الدراسي" value={student.grade_level} />
        </Row>

        {/* Association Info */}
        <h5 className="form-section-title">معلومات الجمعية</h5>
        <Row>
          <DetailItem
            label="الحالة"
            value={statusTranslations[student.status] || student.status}
            isBadge
            badgeVariant={student.status === 'active' ? 'success' : 'secondary'}
          />
          <DetailItem
            label="تاريخ التسجيل"
            value={new Date(student.enrollment_date).toLocaleDateString('en-GB')}
          />
          <DetailItem label="مستوى الحفظ" value={student.memorization_level} />
          <DetailItem label="ملاحظات" value={student.notes} />
          <DetailItem label="ملاحظات مالية" value={student.financial_assistance_notes} />
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

export default StudentDetailsModal;
