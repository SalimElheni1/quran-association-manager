import React from 'react';
import { Table, Button, Spinner, Badge } from 'react-bootstrap';
import TablePagination from '@renderer/components/common/TablePagination';
import EditIcon from '@renderer/components/icons/EditIcon';
import TrashIcon from '@renderer/components/icons/TrashIcon';

function TransactionTable({
  transactions,
  loading,
  compact = false,
  onEdit,
  onDelete,
  onPrint,
  pagination,
  onPageChange,
  onPageSizeChange,
}) {
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
    return <Badge bg={variants[method] || 'secondary'}>{labels[method] || method}</Badge>;
  };

  const getTranslatedIncomeType = (type) => {
    const translations = {
      MONTHLY: 'رسوم شهرية',
      ANNUAL: 'رسوم سنوية',
      SPECIAL: 'رسوم خاصة',
    };
    return translations[type] || type;
  };

  if (loading) {
    return (
      <div className="text-center p-4">
        <Spinner animation="border" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return <div className="text-center p-4 text-muted">لا توجد عمليات مالية</div>;
  }

  const isIncomeTable = transactions.length > 0 && transactions[0].type === 'INCOME';

  const tableComponent = (
    <Table striped bordered hover responsive className="transactions-table">
      <thead>
        <tr>
          <th>#</th>
          <th>التاريخ</th>
          {!compact && <th>رقم الوصل</th>}
          <th>{isIncomeTable ? 'نوع المدخول' : 'الفئة'}</th>
          {!compact && <th>نوع المدخول</th>}
          <th>المبلغ</th>
          {!compact && <th>طريقة الدفع</th>}
          {!compact && <th>إجراءات</th>}
        </tr>
      </thead>
      <tbody>
        {transactions.map((transaction, index) => (
          <tr key={transaction.id}>
            <td>{index + 1}</td>
            <td>{formatDate(transaction.transaction_date)}</td>
            {!compact && <td>{transaction.receipt_number || '-'}</td>}
            <td>{isIncomeTable ? transaction.category || '-' : transaction.category}</td>
            {!compact && <td>{getTranslatedIncomeType(transaction.receipt_type) || '-'}</td>}
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
                    <EditIcon />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => onDelete(transaction)}
                    className="me-2"
                  >
                    <TrashIcon />
                  </Button>
                )}
                {onPrint && (
                  <Button variant="outline-info" size="sm" onClick={() => onPrint(transaction)}>
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

  return (
    <>
      {tableComponent}

      {/* Show pagination only if pagination data is provided and there are more than 0 total items */}
      {pagination && pagination.total > 0 && (
        <TablePagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.total}
          pageSize={pagination.limit}
          onPageChange={onPageChange}
          onPageSizeChange={(newPageSize, newPage) => {
            if (onPageSizeChange) {
              onPageSizeChange(newPageSize, newPage);
            }
          }}
        />
      )}
    </>
  );
}

export default TransactionTable;
