import React, { useState, useEffect } from 'react';
import { Table, Button, Spinner, Alert } from 'react-bootstrap';
import PaymentFormModal from '@renderer/components/financials/PaymentFormModal';
import TablePagination from '@renderer/components/common/TablePagination';
import ConfirmationModal from '@renderer/components/common/ConfirmationModal';
import { formatTND } from '@renderer/utils/formatCurrency';
import { error as logError } from '@renderer/utils/logger';
import { getPaymentMethodLabel } from '@renderer/utils/paymentMethods';

function PaymentsTab() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getPayments();
      setPayments(result);
      setError(null);
    } catch (err) {
      logError('Failed to fetch payments:', err);
      setError(err.message || 'فشل جلب قائمة الدفعات.');
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
      logError('Failed to save payment:', err);
      setError(err.message || 'فشل حفظ الدفعة.');
    }
  };

  const handleDeleteRequest = (payment) => {
    setPaymentToDelete(payment);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!paymentToDelete) return;
    try {
      await window.electronAPI.deletePayment(paymentToDelete.id);
      setPayments(payments.filter((p) => p.id !== paymentToDelete.id));
    } catch (err) {
      logError('Failed to delete payment:', err);
      setError(err.message || 'فشل حذف الدفعة.');
    } finally {
      setShowDeleteModal(false);
      setPaymentToDelete(null);
    }
  };

  // Pagination logic
  const totalItems = payments.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedPayments = payments.slice(startIndex, startIndex + pageSize);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setCurrentPage(1);
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
      {error && (
        <Alert variant="danger" onClose={() => setError(null)} dismissible>
          {error}
        </Alert>
      )}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>سجل الرسوم الدراسية</h4>
        <Button variant="primary" onClick={() => handleShowModal()}>
          إضافة دفعة
        </Button>
      </div>
      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>#</th>
            <th>اسم الطالب</th>
            <th>المبلغ</th>
            <th>طريقة الدفع</th>
            <th>رقم الإيصال</th>
            <th>تاريخ الدفعة</th>
            <th>ملاحظات</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {paginatedPayments.length > 0 ? (
            paginatedPayments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.id}</td>
                <td>{payment.student_name}</td>
                <td className="text-start">{formatTND(payment.amount, 2)} د.ت</td>
                <td>{getPaymentMethodLabel(payment.payment_method)}</td>
                <td>{payment.receipt_number || '-'}</td>
                <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                <td>{payment.notes}</td>
                <td>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="me-2"
                    onClick={() => handleShowModal(payment)}
                  >
                    تعديل
                  </Button>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => handleDeleteRequest(payment)}
                  >
                    حذف
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="8" className="text-center">
                لا توجد رسوم دراسية مسجلة حالياً.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <TablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      <PaymentFormModal
        show={showModal}
        onHide={handleHideModal}
        onSave={handleSave}
        payment={editingPayment}
      />
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={confirmDelete}
        title="تأكيد حذف الدفعة"
        body={`هل أنت متأكد من رغبتك في حذف هذه الدفعة؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />
    </div>
  );
}

export default PaymentsTab;
