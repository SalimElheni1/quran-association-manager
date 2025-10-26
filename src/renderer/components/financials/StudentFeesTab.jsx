import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Card,
  Row,
  Col,
  Alert,
  Spinner,
  Badge,
  Modal,
  Form,
  InputGroup,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import SummaryCard from '@renderer/components/financial/SummaryCard';
import TablePagination from '@renderer/components/common/TablePagination';

const StudentFeesTab = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [payment_type, setPaymentType] = useState('MONTHLY');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [specialFeeClasses, setSpecialFeeClasses] = useState([]);
  const [selectedSpecialFeeClass, setSelectedSpecialFeeClass] = useState('');
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear().toString());
  const [notes, setNotes] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('ALL'); // ALL, PAID, PARTIAL, UNPAID, EXEMPT

  useEffect(() => {
    loadStudents();
  }, []);

  // Helper functions
  const getStudentPaymentStatus = (student) => {
    const { balance, totalPaid, totalDue, fee_category } = student;

    if (fee_category === 'EXEMPT' || fee_category === 'SPONSORED') {
      return 'EXEMPT';
    }

    if (balance <= 0) {
      return 'PAID';
    }

    if (totalPaid > 0 && totalPaid < totalDue) {
      return 'PARTIAL';
    }

    return 'UNPAID';
  };

  const getStatusBadge = (student) => {
    const status = getStudentPaymentStatus(student);

    switch (status) {
      case 'PAID':
        return <Badge bg="success">مدفوع</Badge>;
      case 'PARTIAL':
        return <Badge bg="warning">جزئياً مدفوع</Badge>;
      case 'UNPAID':
        return <Badge bg="danger">غير مدفوع</Badge>;
      case 'EXEMPT':
        return <Badge bg="secondary">معفى</Badge>;
      default:
        return <Badge bg="secondary">غير محدد</Badge>;
    }
  };

  const isPaymentDisabled = (student) => {
    const status = getStudentPaymentStatus(student);
    return status === 'EXEMPT';
  };

  // Filter students based on selected filter
  const getFilteredStudents = () => {
    return students.filter((student) => {
      const status = getStudentPaymentStatus(student);

      switch (paymentStatusFilter) {
        case 'PAID':
          return status === 'PAID';
        case 'PARTIAL':
          return status === 'PARTIAL';
        case 'UNPAID':
          return status === 'UNPAID';
        case 'EXEMPT':
          return status === 'EXEMPT';
        case 'ALL':
        default:
          return true;
      }
    });
  };

  const loadStudents = async () => {
    try {
      setLoading(true);
      const studentsWithFees = await window.electronAPI.studentFeesGetAll();
      setStudents(studentsWithFees);
      // Reset to first page when data is loaded
      setCurrentPage(1);
    } catch (err) {
      setError('Failed to load students.');
    } finally {
      setLoading(false);
    }
  };

  // Get filtered students and pagination
  const filteredStudents = getFilteredStudents();
  const indexOfLastStudent = currentPage * itemsPerPage;
  const indexOfFirstStudent = indexOfLastStudent - itemsPerPage;
  const currentStudents = filteredStudents.slice(indexOfFirstStudent, indexOfLastStudent);
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newPageSize) => {
    setItemsPerPage(10); // Reset to 10 for now, keep fixed
    setCurrentPage(1);
  };

  const handleRecordPayment = async () => {
    if (!selectedStudent || !paymentAmount || !receiptNumber) {
      toast.error('يرجى ملء جميع الحقول الإلزامية.');
      return;
    }

    try {
      const paymentDetails = {
        student_id: selectedStudent.id,
        amount: parseFloat(paymentAmount),
        payment_method: paymentMethod,
        payment_type: payment_type,
        notes: notes,
        academic_year: academicYear,
        receipt_number: receiptNumber,
        ...(paymentMethod === 'CHECK' && checkNumber && { check_number: checkNumber }),
        ...(payment_type === 'SPECIAL' &&
          selectedSpecialFeeClass && { class_id: selectedSpecialFeeClass }),
      };

      await window.electronAPI.studentFeesRecordPayment(paymentDetails);

      toast.success('تم تسجيل الدفعة بنجاح');
      setShowPaymentModal(false);
      // Reset all form fields
      setPaymentAmount('');
      setPaymentMethod('CASH');
      setPaymentType('MONTHLY');
      setReceiptNumber('');
      setCheckNumber('');
      setAcademicYear(new Date().getFullYear().toString());
      setNotes('');
      setSelectedSpecialFeeClass('');
      loadStudents(); // Refresh the list
    } catch (err) {
      const errorMessage = err.message || 'فشل في تسجيل الدفعة. يرجى المحاولة مرة أخرى.';
      toast.error(errorMessage);
    }
  };

  if (loading) {
    return (
      <div className="text-center">
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <>
      {error && (
        <Alert variant="danger" onClose={() => setError(null)} dismissible className="mb-3">
          {error}
        </Alert>
      )}
      <Card className="mb-4">
        <Card.Header>
          <Row className="align-items-center">
            <Col>
              <h5 className="mb-0">إدارة رسوم الطلاب</h5>
            </Col>
            <Col xs="auto">
              <div className="d-flex align-items-center gap-2">
                <Form.Select
                  value={paymentStatusFilter}
                  onChange={(e) => {
                    setPaymentStatusFilter(e.target.value);
                    setCurrentPage(1); // Reset to first page when filter changes
                  }}
                  style={{ width: '160px' }}
                  className="filter-select"
                >
                  <option value="ALL">الجميع</option>
                  <option value="PAID">مدفوع</option>
                  <option value="PARTIAL">جزئياً مدفوع</option>
                  <option value="UNPAID">غير مدفوع</option>
                  <option value="EXEMPT">معفى</option>
                </Form.Select>
                <Button variant="primary" onClick={loadStudents}>
                  تحديث
                </Button>
              </div>
            </Col>
          </Row>
        </Card.Header>
        <Card.Body>
          {students.length > 0 && (
            <Row className="mb-4">
              <SummaryCard
                title="عدد الطلاب المسددين"
                value={students.filter((s) => getStudentPaymentStatus(s) === 'PAID').length}
                variant="success"
                suffix=""
              />
              <SummaryCard
                title="الطلاب الذين دفعوا جزئياً"
                value={students.filter((s) => getStudentPaymentStatus(s) === 'PARTIAL').length}
                variant="warning"
                suffix=""
              />
              <SummaryCard
                title="الطلاب غير المسددين"
                value={students.filter((s) => getStudentPaymentStatus(s) === 'UNPAID').length}
                variant="danger"
                suffix=""
              />
              <SummaryCard
                title="الطلاب المعفيين"
                value={students.filter((s) => getStudentPaymentStatus(s) === 'EXEMPT').length}
                variant="secondary"
                suffix=""
              />
            </Row>
          )}
          {students.length === 0 ? (
            <Alert variant="info">لا توجد طلاب لعرضهم.</Alert>
          ) : (
            <>
              <Table responsive striped hover>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>إجمالي المستحق</th>
                    <th>إجمالي المدفوع</th>
                    <th>المبلغ المتبقي</th>
                    <th>الحالة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {currentStudents.map((student) => (
                    <tr key={student.id}>
                      <td>{student.name}</td>
                      <td>{student.totalDue?.toFixed(2) || 0} د.ت</td>
                      <td>{student.totalPaid?.toFixed(2) || 0} د.ت</td>
                      <td>{student.balance?.toFixed(2) || 0} د.ت</td>
                      <td>{getStatusBadge(student)}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="success"
                          disabled={isPaymentDisabled(student)}
                          onClick={async () => {
                            setSelectedStudent(student);
                            const history = await window.electronAPI.studentFeesGetPaymentHistory(
                              student.id,
                              academicYear,
                            );
                            setPaymentHistory(history);
                            const specialClasses =
                              await window.electronAPI.studentFeesGetClassesWithSpecialFees(
                                student.id,
                              );
                            setSpecialFeeClasses(specialClasses);
                            setShowPaymentModal(true);
                          }}
                        >
                          تسجيل دفعة
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredStudents.length}
                pageSize={itemsPerPage}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </>
          )}
        </Card.Body>
      </Card>

      {/* Payment Modal */}
      <Modal show={showPaymentModal} onHide={() => setShowPaymentModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>تسجيل دفعة جديدة</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedStudent && (
            <div className="mb-4 p-3 bg-light rounded">
              <Row>
                <Col md={6}>
                  <p className="mb-1">
                    <strong>الطالب:</strong> {selectedStudent.name}
                  </p>
                </Col>
                <Col md={6}>
                  <p className="mb-1">
                    <strong>المبلغ المستحق:</strong> {selectedStudent.balance?.toFixed(2) || 0} د.ت
                  </p>
                </Col>
              </Row>
            </div>
          )}
          <Form>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>المبلغ *</Form.Label>
                  <InputGroup>
                    <Form.Control
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      step="0.01"
                      min="0"
                      required
                    />
                    <InputGroup.Text>د.ت</InputGroup.Text>
                  </InputGroup>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>نوع الدفعة</Form.Label>
                  <Form.Select
                    value={payment_type}
                    onChange={(e) => {
                      setPaymentType(e.target.value);
                      if (e.target.value !== 'SPECIAL') {
                        setSelectedSpecialFeeClass('');
                      }
                    }}
                  >
                    <option value="MONTHLY">رسوم شهرية</option>
                    <option
                      value="ANNUAL"
                      disabled={paymentHistory.some((p) => p.payment_type === 'ANNUAL')}
                    >
                      رسوم سنوية
                    </option>
                    <option value="SPECIAL" disabled={specialFeeClasses.length === 0}>
                      رسوم خاصة
                    </option>
                  </Form.Select>
                </Form.Group>
              </Col>
              {payment_type === 'SPECIAL' && (
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>اختر الفصل الدراسي</Form.Label>
                    <Form.Select
                      value={selectedSpecialFeeClass}
                      onChange={(e) => setSelectedSpecialFeeClass(e.target.value)}
                      required
                    >
                      <option value="">اختر فصلًا</option>
                      {specialFeeClasses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              )}
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>طريقة الدفع *</Form.Label>
                  <Form.Select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    required
                  >
                    <option value="CASH">نقدي</option>
                    <option value="CHECK">شيك</option>
                    <option value="TRANSFER">تحويل بنكي</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                {paymentMethod === 'CHECK' && (
                  <Form.Group className="mb-3">
                    <Form.Label>رقم الشيك *</Form.Label>
                    <Form.Control
                      type="text"
                      value={checkNumber}
                      onChange={(e) => setCheckNumber(e.target.value)}
                      placeholder="أدخل رقم الشيك"
                      required
                    />
                  </Form.Group>
                )}
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>رقم الوصل *</Form.Label>
                  <Form.Control
                    type="text"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder="أدخل رقم الوصل"
                    required
                  />
                  <Form.Text className="text-muted">
                    يجب أن يكون رقم الوصل فريداً عبر جميع عمليات الدفع
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>السنة الدراسية</Form.Label>
                  <Form.Control
                    type="text"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    placeholder="مثال: 2024-2025"
                  />
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>ملاحظات</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أضف ملاحظات إضافية (اختياري)"
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowPaymentModal(false)}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            onClick={handleRecordPayment}
            disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || !receiptNumber}
          >
            تسجيل الدفعة
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default StudentFeesTab;
