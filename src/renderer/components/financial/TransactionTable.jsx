import React from 'react';
import { Table, Button, Spinner, Badge } from 'react-bootstrap';
import EditIcon from '@renderer/components/icons/EditIcon';
import TrashIcon from '@renderer/components/icons/TrashIcon';

function TransactionTable({ transactions, loading, compact = false, onEdit, onDelete, onPrint }) {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ar-TN', {
      style: 'currency',
      currency: 'TND',
      minimumFractionDigits: 3,
    }).format(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('ar-TN');
  };

  const getPaymentMethodBadge = (method) => {
    const variants = {
      CASH: 'success',
      CHECK: 'info',
      TRANSFER: 'primary',
    };
    const labels = {
      CASH: 'نقدا',
      CHECK: 'شيك',
      TRANSFER: 'تحويل',
    };
    return (
      <Badge bg={variants[method] || 'secondary'}>
        {labels[method] || method}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="text-center p-4">
        <Spinner animation="border" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center p-4 text-muted">
        لا توجد عمليات مالية
      </div>
    );
  }

  return (
    <Table striped bordered hover responsive className="transactions-table">
      <thead>
        <tr>
          <th>#</th>
          {!compact && <th>المرجع</th>}
          <th>التاريخ</th>
          {!compact && <th>رقم الوصل</th>}
          <th>الفئة</th>
          {!compact && <th>الوصف</th>}
          <th>المبلغ</th>
          {!compact && <th>طريقة الدفع</th>}
          {!compact && <th>إجراءات</th>}
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction, index) => (
          <tr key={transaction.id}>
            <td>{index + 1}</td>
            {!compact && <td><small className="text-muted">{transaction.matricule || '-'}</small></td>}
            <td>{formatDate(transaction.transaction_date)}</td>
            {!compact && <td>{transaction.voucher_number || '-'}</td>}
            <td>{transaction.category}</td>
            {!compact && <td>{transaction.description}</td>}
            <td className={transaction.type === 'INCOME' ? 'text-success' : 'text-danger'}>
              {formatCurrency(transaction.amount)}
            </td>
            {!compact && <td>{getPaymentMethodBadge(transaction.payment_method)}</td>}
            {!compact && (
              <td className="table-actions">
                {onEdit && (
                  <Button
                    variant="outline-success"
                    size="sm"
                    onClick={() => onEdit(transaction)}
                    className="me-2"
                  >
                    <EditIcon /> تعديل
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => onDelete(transaction)}
                    className="me-2"
                  >
                    <TrashIcon /> حذف
                  </Button>
                )}
                {onPrint && (
                  <Button
                    variant="outline-info"
                    size="sm"
                    onClick={() => onPrint(transaction)}
                  >
                    🖨️ طباعة
                  </Button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default TransactionTable;
