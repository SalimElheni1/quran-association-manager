import React from 'react';
import { Modal, Button, Row, Col, Badge } from 'react-bootstrap';
import ClassesIcon from './icons/ClassesIcon';

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

  const genderTranslations = {
    all: 'الكل',
    men: 'رجال',
    women: 'نساء',
    kids: 'أطفال',
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>
          <ClassesIcon className="me-2" />
          تفاصيل الفصل: {classData.name}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <h5 className="form-section-title">المعلومات الأساسية</h5>
        <Row>
          <DetailItem label="اسم الفصل" value={classData.name || 'غير محدد'} />
          <DetailItem label="المعلم المسؤول" value={classData.teacher_name || 'غير محدد'} />
          <DetailItem
            label="الحالة"
            value={statusTranslations[classData.status] || classData.status}
            isBadge
            badgeVariant={statusVariants[classData.status] || 'light'}
          />
          <DetailItem
            label="الجنس"
            value={genderTranslations[classData.gender] || classData.gender}
          />
          <DetailItem label="سعة الفصل" value={classData.capacity ?? 'غير محدد'} />
          <DetailItem label="أوقات الدراسة" value={formatSchedule(classData.schedule)} />
          <DetailItem
            label="تاريخ البدء"
            value={
              classData.start_date
                ? new Date(classData.start_date).toISOString().split('T')[0]
                : 'غير محدد'
            }
          />
          <DetailItem
            label="تاريخ الانتهاء"
            value={
              classData.end_date
                ? new Date(classData.end_date).toISOString().split('T')[0]
                : 'غير محدد'
            }
          />
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
