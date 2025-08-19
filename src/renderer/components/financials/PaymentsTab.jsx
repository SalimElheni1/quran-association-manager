import React, { useState, useEffect } from 'react';
import { Table, Button, Spinner, Alert } from 'react-bootstrap';
import PaymentFormModal from './PaymentFormModal';

function PaymentsTab() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getPayments();
      setPayments(result);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch payments:', err);
      setError(err.message || 'فشل في جلب قائمة الدفعات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const handleShowModal = (payment = null) => {
    setEditingPayment(payment);
    setShowModal(true);
  };

  const handleHideModal = () => {
    setShowModal(false);
    setEditingPayment(null);
  };

  const handleSave = async (formData) => {
    try {
      if (editingPayment) {
        const updatedPayment = await window.electronAPI.updatePayment(formData);
        setPayments(payments.map((p) => (p.id === updatedPayment.id ? updatedPayment : p)));
      } else {
        const newPayment = await window.electronAPI.addPayment(formData);
        setPayments([newPayment, ...payments]);
      }
      handleHideModal();
    } catch (err) {
      console.error('Failed to save payment:', err);
      setError(err.message || 'فشل في حفظ الدفعة.');
    }
  };

  const handleDelete = async (paymentId) => {
    if (window.confirm('هل أنت متأكد من رغبتك في حذف هذه الدفعة؟')) {
      try {
        await window.electronAPI.deletePayment(paymentId);
        setPayments(payments.filter((p) => p.id !== paymentId));
      } catch (err) {
        console.error('Failed to delete payment:', err);
        setError(err.message || 'فشل في حذف الدفعة.');
      }
    }
  };

  if (loading) {
    return (
      <div className="text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </div>
    );
  }

  return (
    <div>
      {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>قائمة الرسوم الدراسية</h4>
        <Button variant="primary" onClick={() => handleShowModal()}>إضافة دفعة جديدة</Button>
      </div>
      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>#</th>
            <th>الطالب</th>
            <th>المبلغ</th>
            <th>طريقة الدفع</th>
            <th>تاريخ الدفع</th>
            <th>ملاحظات</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {payments.length > 0 ? (
            payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.id}</td>
                <td>{payment.student_name}</td>
                <td className="text-start">{payment.amount.toFixed(2)}</td>
                <td>{payment.payment_method}</td>
                <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                <td>{payment.notes}</td>
                <td>
                  <Button variant="outline-secondary" size="sm" className="me-2" onClick={() => handleShowModal(payment)}>
                    تعديل
                  </Button>
                  <Button variant="outline-danger" size="sm" onClick={() => handleDelete(payment.id)}>
                    حذف
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="7" className="text-center">
                لا توجد دفعات مسجلة حالياً.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <PaymentFormModal
        show={showModal}
        onHide={handleHideModal}
        onSave={handleSave}
        payment={editingPayment}
      />
    </div>
  );
}

export default PaymentsTab;
