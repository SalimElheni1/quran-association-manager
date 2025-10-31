import React, { useState, useEffect } from 'react';
import { Button, Card } from 'react-bootstrap';
import { toast } from 'react-toastify';
import TransactionTable from '@renderer/components/financial/TransactionTable';
import TransactionFilters from '@renderer/components/financial/TransactionFilters';
import TransactionModal from '@renderer/components/financial/TransactionModal';
import VoucherPrintModal from '@renderer/components/financial/VoucherPrintModal';
import ConfirmationModal from '@renderer/components/common/ConfirmationModal';
import ExportModal from '@renderer/components/modals/ExportModal';
import ImportModal from '@renderer/components/modals/ImportModal';
import { useTransactions } from '@renderer/hooks/useTransactions';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { PERMISSIONS } from '@renderer/utils/permissions';
import { error as logError } from '@renderer/utils/logger';
import ExportIcon from '@renderer/components/icons/ExportIcon';
import ImportIcon from '@renderer/components/icons/ImportIcon';

const incomeFields = [
  { key: 'date', label: 'التاريخ' },
  { key: 'description', label: 'الوصف' },
  { key: 'amount', label: 'المبلغ' },
  { key: 'category_name', label: 'الفئة' },
  { key: 'payment_method', label: 'طريقة الدفع' },
];

function IncomePage() {
  const { hasPermission } = usePermissions();
  const [filters, setFilters] = useState({ type: 'INCOME', page: 1, limit: 25 });
  const [showModal, setShowModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const { transactions, pagination, loading, refresh } = useTransactions(filters);

  // Listen for import completion events to refresh data
  useEffect(() => {
    const handleImportCompleted = (payload) => {
      // Check if income data was imported (UI sheet name is 'المداخيل')
      if (payload.sheets && payload.sheets.includes('المداخيل')) {
        console.log('Income page: Import completed, refreshing data');
        refresh();
      }
    };

    const unsubscribe = window.electronAPI.onImportCompleted(handleImportCompleted);

    return unsubscribe;
  }, [refresh]);

  const handleAdd = () => {
    setSelectedTransaction(null);
    setShowModal(true);
  };

  const handleEdit = (transaction) => {
    setSelectedTransaction(transaction);
    setShowModal(true);
  };

  const handleSave = async (transaction) => {
    try {
      if (selectedTransaction) {
        await window.electronAPI.updateTransaction(selectedTransaction.id, transaction);
        toast.success('✅ تم تحديث المدخول بنجاح');
      } else {
        await window.electronAPI.addTransaction(transaction);
        toast.success('✅ تم إضافة المدخول بنجاح');
      }
      setShowModal(false);
      refresh();
      window.dispatchEvent(new Event('financial-data-changed'));
    } catch (err) {
      logError('Error saving income:', err);
      toast.error(err.message || '❌ فشل في حفظ المدخول');
    }
  };

  const handleDeleteRequest = (transaction) => {
    setTransactionToDelete(transaction);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!transactionToDelete) return;

    try {
      await window.electronAPI.deleteTransaction(transactionToDelete.id || transactionToDelete);
      toast.success('✅ تم حذف المدخول بنجاح');
      refresh();
      window.dispatchEvent(new Event('financial-data-changed'));
    } catch (err) {
      logError('Error deleting income:', err);
      toast.error('❌ فشل في حذف المدخول');
    } finally {
      setShowDeleteModal(false);
      setTransactionToDelete(null);
    }
  };

  const handlePrint = (transaction) => {
    setSelectedTransaction(transaction);
    setShowPrintModal(true);
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>المداخيل</h1>
        <div className="page-header-actions">
          {hasPermission(PERMISSIONS.FINANCIALS_VIEW) && (
            <Button variant="outline-primary" onClick={() => setShowExportModal(true)}>
              <ExportIcon className="ms-2" /> تصدير البيانات
            </Button>
          )}
          {hasPermission(PERMISSIONS.FINANCIALS_MANAGE) && (
            <Button variant="outline-success" onClick={() => setShowImportModal(true)}>
              <ImportIcon className="ms-2" /> استيراد البيانات
            </Button>
          )}
          {hasPermission(PERMISSIONS.FINANCIALS_MANAGE) && (
            <Button variant="primary" onClick={handleAdd}>
              + إضافة مدخول
            </Button>
          )}
        </div>
      </div>

      <Card>
        <Card.Body>
          <TransactionFilters type="INCOME" filters={filters} onChange={setFilters} />

          <TransactionTable
            transactions={transactions}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDeleteRequest}
            onPrint={handlePrint}
            pagination={pagination}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
            onPageSizeChange={(pageSize, page) =>
              setFilters((prev) => ({ ...prev, limit: pageSize, page }))
            }
          />
        </Card.Body>
      </Card>

      <TransactionModal
        show={showModal}
        type="INCOME"
        transaction={selectedTransaction}
        onHide={() => setShowModal(false)}
        onSave={handleSave}
        defaultCategory="التبرعات النقدية"
        customTitle={!selectedTransaction ? 'إضافة مدخول' : undefined}
      />

      <VoucherPrintModal
        show={showPrintModal}
        transaction={selectedTransaction}
        onHide={() => setShowPrintModal(false)}
      />

      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={confirmDelete}
        title="تأكيد حذف المدخول"
        body="هل أنت متأكد من رغبتك في حذف هذا المدخول؟ لا يمكن التراجع عن هذا الإجراء."
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />

      <ExportModal
        show={showExportModal}
        handleClose={() => setShowExportModal(false)}
        exportType="income"
        fields={incomeFields}
        title="تصدير المداخيل"
      />

      <ImportModal
        show={showImportModal}
        handleClose={() => setShowImportModal(false)}
        importType="المداخيل"
        title="استيراد المداخيل"
      />
    </div>
  );
}

export default IncomePage;
