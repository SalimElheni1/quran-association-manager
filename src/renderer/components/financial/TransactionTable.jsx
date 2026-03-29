import React from 'react';
import { Table, Button, Spinner, Badge } from 'react-bootstrap';
import TablePagination from '@renderer/components/common/TablePagination';
import EditIcon from '@renderer/components/icons/EditIcon';
import TrashIcon from '@renderer/components/icons/TrashIcon';
import { formatTND } from '@renderer/utils/formatCurrency';

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
    return formatTND(amount, 3) + ' د.ت';
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

  const getTranslatedIncomeType = (transaction) => {
    // Special handling for student fee transactions with CUSTOM receipt_type
    if (transaction.category === 'رسوم الطلاب' && transaction.receipt_type === 'CUSTOM') {
      return 'رسوم الطلاب';
    }

    // Use the translated receipt_type from backend if available
    if (transaction.receipt_type_display && transaction.receipt_type_display !== 'CUSTOM') {
      return transaction.receipt_type_display;
    }

    // Fallback translations
    const translations = {
      MONTHLY: 'رسوم شهرية',
      ANNUAL: 'رسوم سنوية',
      SPECIAL: 'رسوم خاصة',
      'رسوم الطلاب': 'رسوم الطلاب',
    };

    return translations[transaction.receipt_type] || transaction.receipt_type || '-';
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

  const isIncomeTable =
    transactions.length > 0 &&
    (transactions[0].type === 'INCOME' || transactions[0].type === 'مدخول');

  const tableComponent = (
    <Table striped bordered hover responsive className="transactions-table">
      <thead>
        <tr>
          <th>#</th>
          <th>التاريخ</th>
          {!compact && <th>{isIncomeTable ? 'رقم وصل استلام' : 'رقم الوصل'}</th>}
          <th>{isIncomeTable ? 'الاسم واللقب' : 'المستفيد / الجهة'}</th>
          <th>الفئة</th>
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
            {!compact && <td>{transaction.voucher_number || '-'}</td>}
            <td>{transaction.related_person_name || '-'}</td>
            <td>{isIncomeTable ? (transaction.receipt_type_display || transaction.category) : transaction.category}</td>
            <td
              className={
                transaction.type === 'INCOME' || transaction.type === 'مدخول'
                  ? 'text-success'
                  : 'text-danger'
              }
            >
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
