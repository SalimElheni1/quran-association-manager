import React, { useState, useEffect } from 'react';
import { Button, Card, Table, Badge, Alert, Row, Col } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { useStudents } from '@renderer/hooks/useStudents';
import { useTransactions } from '@renderer/hooks/useTransactions';
import TransactionModal from '@renderer/components/financial/TransactionModal';
import { error as logError } from '@renderer/utils/logger';

function StudentFeesPage() {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [feeType, setFeeType] = useState(''); // 'معلوم الترسيم' or 'معلوم شهري'

  const { students, loading: studentsLoading } = useStudents({ limit: 1000 });
  const {
    transactions,
    loading: transactionsLoading,
    refresh,
  } = useTransactions({
    type: 'INCOME',
    receipt_type: feeType || undefined,
  });

  const getStudentPaymentStatus = (student, receiptType) => {
    const studentPayments = transactions.filter(
      (t) =>
        t.related_entity_id === student.id &&
        t.related_entity_type === 'Student' &&
        t.receipt_type === receiptType,
    );

    const totalPaid = studentPayments.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const hasPaid = totalPaid > 0;

    return { hasPaid, totalPaid, payments: studentPayments };
  };

  const handleAddFee = (student, receiptType) => {
    setSelectedStudent(student);
    setFeeType(receiptType);
    setShowTransactionModal(true);
  };

  const handleSaveTransaction = async (transaction) => {
    try {
      await window.electronAPI.addTransaction({
        ...transaction,
        receipt_type: feeType,
        related_entity_id: selectedStudent.id,
        related_entity_type: 'Student',
        related_person_name: selectedStudent.name,
        donor_cin: selectedStudent.national_id || '',
      });
      toast.success('✅ تم تسجيل الدفعة بنجاح');
      setShowTransactionModal(false);
      refresh();
      window.dispatchEvent(new Event('financial-data-changed'));
    } catch (err) {
      logError('Error saving fee:', err);
      toast.error(err.message || '❌ فشل في حفظ الدفعة');
    }
  };

  const StudentFeesRow = ({ student }) => {
    const registrationStatus = getStudentPaymentStatus(student, 'معلوم الترسيم');
    const monthlyStatus = getStudentPaymentStatus(student, 'معلوم شهري');

    return (
      <tr>
        <td>{student.matricule}</td>
        <td>{student.name}</td>
        <td>
          {registrationStatus.hasPaid ? (
            <Badge bg="success">مدفوع - {registrationStatus.totalPaid.toFixed(2)} د.ت</Badge>
          ) : (
            <Badge bg="danger">غير مدفوع</Badge>
          )}
        </td>
        <td>
          {monthlyStatus.hasPaid ? (
            <Badge bg="success">مدفوع - {monthlyStatus.totalPaid.toFixed(2)} د.ت</Badge>
          ) : (
            <Badge bg="warning">مدفوع جزئياً</Badge>
          )}
        </td>
        <td>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => handleAddFee(student, 'معلوم الترسيم')}
            disabled={registrationStatus.hasPaid}
          >
            {registrationStatus.hasPaid ? 'مدفوع' : 'دفع ترسيم'}
          </Button>{' '}
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => handleAddFee(student, 'معلوم شهري')}
          >
            دفع شهري
          </Button>
        </td>
      </tr>
    );
  };

  const getSummaryStats = () => {
    const totalStudents = students.length;
    const paidRegistration = students.filter(
      (s) => getStudentPaymentStatus(s, 'معلوم الترسيم').hasPaid,
    ).length;
    const paidMonthly = students.filter(
      (s) => getStudentPaymentStatus(s, 'معلوم شهري').hasPaid,
    ).length;

    return { totalStudents, paidRegistration, paidMonthly };
  };

  const { totalStudents, paidRegistration, paidMonthly } = getSummaryStats();

  if (studentsLoading || transactionsLoading) {
    return <div className="text-center mt-5">جاري التحميل...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>تتبع رسوم الطلاب</h1>
      </div>

      {/* Summary Stats */}
      <Row className="mb-4">
        <Col md={4}>
          <Card>
            <Card.Body className="text-center">
              <h4>{totalStudents}</h4>
              <p className="text-muted">إجمالي الطلاب</p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card>
            <Card.Body className="text-center">
              <h4>{paidRegistration}</h4>
              <p className="text-muted">دفع رسوم الترسيم</p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card>
            <Card.Body className="text-center">
              <h4>{paidMonthly}</h4>
              <p className="text-muted">دفع رسوم شهرية</p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card>
        <Card.Header>
          <h5>قائمة الطلاب ورسومهم</h5>
        </Card.Header>
        <Card.Body>
          {students.length === 0 ? (
            <Alert variant="info">لا توجد طلاب مسجلين</Alert>
          ) : (
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>الرقم الوردي</th>
                  <th>اسم الطالب</th>
                  <th>رسوم الترسيم</th>
                  <th>الرسوم الشهرية</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <StudentFeesRow key={student.id} student={student} />
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      <TransactionModal
        show={showTransactionModal}
        type="INCOME"
        onHide={() => setShowTransactionModal(false)}
        onSave={handleSaveTransaction}
        initialReceiptType={feeType}
      />
    </div>
  );
}

export default StudentFeesPage;
