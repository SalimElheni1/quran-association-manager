import React from 'react';
import { Modal, Button, Row, Col, Badge } from 'react-bootstrap';

// Reusable DetailItem component for consistent display
function DetailItem({ label, value, isBadge = false, badgeVariant = 'secondary' }) {
  if (!value && value !== 0) return null; // Also show if value is 0 (e.g., capacity)

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

function ClassDetailsModal({ show, handleClose, classData }) {
  if (!classData) return null;

  const formatSchedule = (scheduleJSON) => {
    if (!scheduleJSON || scheduleJSON === '[]') return 'غير محدد';
    try {
      const scheduleArray = JSON.parse(scheduleJSON);
      if (!Array.isArray(scheduleArray) || scheduleArray.length === 0) return 'غير محدد';

      const dayTranslations = {
        Monday: 'الإثنين',
        Tuesday: 'الثلاثاء',
        Wednesday: 'الأربعاء',
        Thursday: 'الخميس',
        Friday: 'الجمعة',
        Saturday: 'السبت',
        Sunday: 'الأحد',
      };

      return scheduleArray
        .map((item) => `${dayTranslations[item.day] || item.day}: ${item.time}`)
        .join(' | ');
    } catch (e) {
      return 'جدول غير صالح';
    }
  };

  const statusTranslations = {
    pending: 'قيد الانتظار',
    active: 'نشط',
    completed: 'مكتمل',
  };

  const statusVariants = {
    pending: 'warning',
    active: 'success',
    completed: 'secondary',
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="fas fa-school me-2"></i>
          تفاصيل الفصل: {classData.name}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <h5 className="form-section-title">المعلومات الأساسية</h5>
        <Row>
          <DetailItem label="اسم الفصل" value={classData.name} />
          <DetailItem label="نوع الفصل" value={classData.class_type} />
          <DetailItem label="المعلم المسؤول" value={classData.teacher_name || 'غير محدد'} />
          <DetailItem
            label="الحالة"
            value={statusTranslations[classData.status] || classData.status}
            isBadge
            badgeVariant={statusVariants[classData.status] || 'light'}
          />
          <DetailItem label="سعة الفصل" value={classData.capacity} />
          <DetailItem label="أوقات الدراسة" value={formatSchedule(classData.schedule)} />
          <DetailItem label="تاريخ البدء" value={classData.start_date?.split('T')[0]} />
          <DetailItem label="تاريخ الانتهاء" value={classData.end_date?.split('T')[0]} />
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

export default ClassDetailsModal;
