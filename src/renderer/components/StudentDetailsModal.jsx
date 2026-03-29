import { Modal, Button, Row, Col, Badge, Spinner } from 'react-bootstrap';
import UserCircleIcon from './icons/UserCircleIcon';
import { useState, useEffect } from 'react';
import { formatTND } from '@renderer/utils/formatCurrency';

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

  const [balanceSummary, setBalanceSummary] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [historyData, setHistoryData] = useState({ charges: [], payments: [] });
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (show && student?.id) {
      const fetchData = async () => {
        try {
          setLoadingBalance(true);
          setLoadingHistory(true);
          const summary = await window.electronAPI.studentFeesGetBalanceSummary(student.id);
          setBalanceSummary(summary);
          
          // Fetch payments for the current year
          const currentYear = new Date().getFullYear().toString();
          const payments = await window.electronAPI.studentFeesGetPaymentHistory(student.id, currentYear);
          setHistoryData({ 
            charges: summary.charges || [], 
            payments: payments || [] 
          });
        } catch (error) {
          console.error('Error fetching student details:', error);
        } finally {
          setLoadingBalance(false);
          setLoadingHistory(false);
        }
      };
      fetchData();
    } else {
      setBalanceSummary(null);
      setHistoryData({ charges: [], payments: [] });
    }
  }, [show, student]);

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

  const genderTranslations = {
    Male: 'ذكر',
    Female: 'أنثى',
  };

  const feeCategoryTranslations = {
    CAN_PAY: 'قادر على الدفع',
    EXEMPT: 'معفى من الرسوم',
    SPONSORED: 'مكفول',
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>
          <UserCircleIcon className="me-2" />
          تفاصيل الطالب: {student.name}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Personal Info */}
        <h5 className="form-section-title">المعلومات الشخصية</h5>
        <Row>
          <DetailItem label="الاسم واللقب" value={student.name} />
          <DetailItem
            label="تاريخ الميلاد"
            value={
              student.date_of_birth
                ? new Date(student.date_of_birth).toLocaleDateString('en-GB')
                : null
            }
          />
          <DetailItem label="العمر" value={calculateAge(student.date_of_birth)} />
          <DetailItem label="الجنس" value={genderTranslations[student.gender] || student.gender} />
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

        {/* Financial Info */}
        <h5 className="form-section-title">المعلومات المالية</h5>
        <Row>
          <DetailItem 
            label="فئة الرسوم" 
            value={feeCategoryTranslations[student.fee_category] || student.fee_category} 
            isBadge
            badgeVariant={student.fee_category === 'EXEMPT' ? 'secondary' : student.fee_category === 'SPONSORED' ? 'info' : 'primary'}
          />
          {student.custom_fee_amount > 0 ? (
            <DetailItem label="المعلوم الشهري القار" value={`${formatTND(student.custom_fee_amount, 3)} د.ت`} />
          ) : student.discount_percentage > 0 ? (
            <DetailItem label="قيمة الخصم" value={`${formatTND(student.discount_percentage, 3)} د.ت`} />
          ) : null}
          {student.discount_reason && (
            <DetailItem label="سبب الخصم" value={student.discount_reason} />
          )}
        </Row>

        {student.fee_category === 'SPONSORED' && (
          <>
            <h5 className="form-section-title">معلومات الكفالة</h5>
            <Row>
              <DetailItem label="اسم الكافل" value={student.sponsor_name} />
              <DetailItem label="هاتف الكافل" value={student.sponsor_phone} />
              <DetailItem label="رقم هوية الكافل" value={student.sponsor_cin} />
            </Row>
          </>
        )}

        {student.fee_category !== 'EXEMPT' && (
          <>
            <h5 className="form-section-title">الملخص المالي</h5>
            {loadingBalance ? (
              <div className="text-center p-3">
                <Spinner animation="border" size="sm" />
              </div>
            ) : balanceSummary ? (
              <Row>
                <DetailItem label="إجمالي المستحق" value={`${formatTND(balanceSummary.totalDue, 3)} د.ت`} />
                <DetailItem label="إجمالي المدفوع" value={`${formatTND(balanceSummary.totalPaid, 3)} د.ت`} />
                <DetailItem 
                  label={balanceSummary.displayLabel} 
                  value={`${formatTND(balanceSummary.displayAmount, 3)} د.ت`}
                  isBadge
                  badgeVariant={balanceSummary.displayType === 'owed' ? 'danger' : 'success'}
                />
              </Row>
            ) : (
              <div className="text-center p-3 text-muted">لا توجد بيانات مالية متاحة.</div>
            )}
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
          <DetailItem label="الرقم التعريفي" value={student.matricule} />
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
          <Col md={12}>
            <div className="detail-item mb-3">
              <strong className="detail-label">مستوى الحفظ:</strong>
              {student.surahs && student.surahs.length > 0 && (
                <div className="mt-2">
                  <div className="mb-2">
                    <strong style={{ fontSize: '14px', color: '#495057' }}>السور المحفوظة: </strong>
                    <span className="detail-value">
                      {(student.surahs || [])
                        .filter((s) => s.name_ar)
                        .map((s) => `سورة ${s.name_ar}`)
                        .join('، ') || 'لا توجد سور محفوظة'}
                    </span>
                  </div>
                </div>
              )}
              {student.hizbs && student.hizbs.length > 0 && (
                <div className="mb-2">
                  <strong style={{ fontSize: '14px', color: '#495057' }}>الأحزاب المحفوظة: </strong>
                  <span className="detail-value">
                    {(student.hizbs || [])
                      .filter((h) => h.hizb_number)
                      .map((h) => `حزب ${h.hizb_number}`)
                      .join('، ') || 'لا توجد أحزاب محفوظة'}
                  </span>
                </div>
              )}
              {!student.surahs && !student.hizbs && student.memorization_level && (
                <span className="detail-value">{student.memorization_level}</span>
              )}
              {!student.surahs && !student.hizbs && !student.memorization_level && (
                <span className="detail-value">لا يوجد</span>
              )}
            </div>
          </Col>
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
