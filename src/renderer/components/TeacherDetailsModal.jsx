import React from 'react';
import { Modal, Button, Row, Col } from 'react-bootstrap';
import TeacherIcon from './icons/TeacherIcon';
import { calculateAge } from '@renderer/utils/age';

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

const genderTranslations = {
  Male: 'ذكر',
  Female: 'أنثى',
};

function TeacherDetailsModal({ show, handleClose, teacher }) {
  if (!teacher) return null;

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>
          <TeacherIcon className="me-2" />
          تفاصيل المعلم: {teacher.name}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Personal Info */}
        <h5 className="form-section-title">المعلومات الشخصية</h5>
        <Row>
          <DetailItem label="الرقم التعريفي" value={teacher.matricule} />
          <DetailItem label="الاسم الكامل" value={teacher.name} />
          <DetailItem label="رقم الهوية" value={teacher.national_id} />
          <DetailItem label="تاريخ الميلاد" value={teacher.date_of_birth?.split('T')[0]} />
          <DetailItem label="العمر" value={calculateAge(teacher.date_of_birth)} />
          <DetailItem label="الجنس" value={genderTranslations[teacher.gender] || teacher.gender} />
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
