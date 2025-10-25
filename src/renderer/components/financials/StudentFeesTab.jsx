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

const StudentFeesTab = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    try {
      setLoading(true);
      const studentsWithFees = await window.electronAPI.studentFeesGetAll();
      setStudents(studentsWithFees);
    } catch (err) {
      setError('Failed to load students.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedStudent || !paymentAmount) return;

    try {
      const paymentDetails = {
        student_id: selectedStudent.id,
        amount: parseFloat(paymentAmount),
        payment_method: paymentMethod,
        payment_type: 'MONTHLY',
        notes: notes,
        academic_year: new Date().getFullYear().toString(),
      };

      await window.electronAPI.studentFeesRecordPayment(paymentDetails);
      setShowPaymentModal(false);
      setPaymentAmount('');
      setNotes('');
      loadStudents(); // Refresh the list
    } catch (err) {
      setError('Failed to record payment.');
    }
  };

  if (loading) {
    return (
      <div className="text-center">
        <Spinner animation="border" />
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  return (
    <>
      <Card className="mb-4">
        <Card.Header>
          <Row className="align-items-center">
            <Col>
              <h5 className="mb-0">إدارة رسوم الطلاب</h5>
            </Col>
            <Col xs="auto">
              <Button variant="primary" onClick={loadStudents}>
                تحديث
              </Button>
            </Col>
          </Row>
        </Card.Header>
        <Card.Body>
          {students.length === 0 ? (
            <Alert variant="info">لا توجد طلاب لعرضهم.</Alert>
          ) : (
            <Table responsive striped hover>
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>المبلغ المستحق</th>
                  <th>المبلغ المدفوع</th>
                  <th>الرصيد</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td>{student.name}</td>
                    <td>{student.totalDue?.toFixed(2) || 0} د.ت</td>
                    <td>{student.totalPaid?.toFixed(2) || 0} د.ت</td>
                    <td>{student.balance?.toFixed(2) || 0} د.ت</td>
                    <td>
                      {student.balance === 0 ? (
                        <Badge bg="success">مدفوع</Badge>
                      ) : (
                        <Badge bg="danger">غير مدفوع</Badge>
                      )}
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => {
                          setSelectedStudent(student);
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
          )}
        </Card.Body>
      </Card>

      {/* Payment Modal */}
      <Modal show={showPaymentModal} onHide={() => setShowPaymentModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>تسجيل دفعة</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedStudent && (
            <div className="mb-3">
              <p>
                <strong>الطالب:</strong> {selectedStudent.name}
              </p>
              <p>
                <strong>المبلغ المستحق:</strong> {selectedStudent.balance?.toFixed(2) || 0} د.ت
              </p>
            </div>
          )}
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>المبلغ</Form.Label>
              <InputGroup>
                <Form.Control
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  step="0.01"
                  min="0"
                />
                <InputGroup.Text>د.ت</InputGroup.Text>
              </InputGroup>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>طريقة الدفع</Form.Label>
              <Form.Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="CASH">نقدي</option>
                <option value="CHECK">شيك</option>
                <option value="TRANSFER">تحويل بنكي</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>ملاحظات</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
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
            disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
          >
            تسجيل الدفعة
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default StudentFeesTab;
