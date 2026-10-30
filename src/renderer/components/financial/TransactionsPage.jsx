import React, { useState, useEffect } from 'react';
import { Button, Card } from 'react-bootstrap';
import { toast } from 'react-toastify';
import TransactionTable from '@renderer/components/financial/TransactionTable';
import ShowDeletedSwitch from '@renderer/components/common/ShowDeletedSwitch';
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

const EXPORT_FIELDS = [
  { key: 'date', label: 'التاريخ' },
  { key: 'description', label: 'الوصف' },
  { key: 'amount', label: 'المبلغ' },
  { key: 'category_name', label: 'الفئة' },
  { key: 'payment_method', label: 'طريقة الدفع' },
];

// What tells the income page from the expenses page.
export const TRANSACTION_PAGES = {
  INCOME: {
    title: 'المداخيل',
    one: 'المدخول', // «تم إضافة المدخول بنجاح»
    addLabel: 'إضافة مدخول',
    exportType: 'income',
    importType: 'المداخيل',
    defaultCategory: 'التبرعات النقدية',
    customTitle: 'إضافة مدخول',
    voidedSwitchId: 'income-show-voided',
  },
  EXPENSE: {
    title: 'المصاريف',
    one: 'المصروف',
    addLabel: 'إضافة مصروف',
    exportType: 'expenses',
    importType: 'المصاريف',
    voidedSwitchId: 'expense-show-voided',
  },
};

/**
 * The list of incomes or of expenses, with adding, editing, voiding, printing, export and import.
 * @param {{ type: 'INCOME'|'EXPENSE' }} props
 */
function TransactionsPage({ type }) {
  const page = TRANSACTION_PAGES[type];
  const { hasPermission } = usePermissions();
  const [filters, setFilters] = useState({ type, page: 1, limit: 25 });
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printTransaction, setPrintTransaction] = useState(null);

  const { transactions, pagination, loading, refresh } = useTransactions(filters);

  // Listen for import completion events and financial data changes to refresh data
  useEffect(() => {
    const handleImportCompleted = (payload) => {
      // Refresh when this page's data was imported (its UI sheet name, e.g. 'المداخيل')
      if (payload.sheets && payload.sheets.includes(page.importType)) {
        refresh();
      }
    };

    const handleDataChange = () => refresh();
    window.addEventListener('financial-data-changed', handleDataChange);

    const unsubscribe = window.electronAPI.onImportCompleted(handleImportCompleted);

    return () => {
      window.removeEventListener('financial-data-changed', handleDataChange);
      unsubscribe();
    };
  }, [refresh, page.importType]);

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
        toast.success(`تم تحديث ${page.one} بنجاح`);
      } else {
        await window.electronAPI.addTransaction(transaction);
        toast.success(`تم إضافة ${page.one} بنجاح`);
        // Offer a printed receipt (income) or payment voucher (expense) right away
        setPrintTransaction({ ...transaction, type });
        setShowPrintModal(true);
      }
      setShowModal(false);
      refresh();
      window.dispatchEvent(new Event('financial-data-changed'));
    } catch (err) {
      logError(`Error saving ${type}:`, err);
      toast.error(err.message || `فشل في حفظ ${page.one}`);
    }
  };

  const handlePrint = (transaction) => {
    setPrintTransaction(transaction);
    setShowPrintModal(true);
  };

  const handleDeleteRequest = (transaction) => {
    setTransactionToDelete(transaction);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!transactionToDelete) return;

    try {
      await window.electronAPI.deleteTransaction(transactionToDelete.id || transactionToDelete);
      toast.success(`تم إلغاء ${page.one} بنجاح`);
      refresh();
      window.dispatchEvent(new Event('financial-data-changed'));
    } catch (err) {
      logError(`Error deleting ${type}:`, err);
      // Show why (e.g. a student fee payment is voided from the student fees tab).
      const reason = err && err.message ? err.message.split('Error:').pop().trim() : '';
      toast.error(reason || `فشل في إلغاء ${page.one}`);
    } finally {
      setShowDeleteModal(false);
      setTransactionToDelete(null);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{page.title}</h1>
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
              + {page.addLabel}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <Card.Body>
          <TransactionFilters type={type} filters={filters} onChange={setFilters} />
          <div className="d-flex justify-content-end mb-2">
            <ShowDeletedSwitch
              id={page.voidedSwitchId}
              label="عرض الملغاة"
              checked={!!filters.showVoided}
              onChange={(checked) =>
                setFilters((prev) => ({ ...prev, showVoided: checked, page: 1 }))
              }
            />
          </div>

          <TransactionTable
            transactions={transactions}
            loading={loading}
            onEdit={filters.showVoided ? undefined : handleEdit}
            onDelete={filters.showVoided ? undefined : handleDeleteRequest}
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
        type={type}
        transaction={selectedTransaction}
        onHide={() => setShowModal(false)}
        onSave={handleSave}
        defaultCategory={page.defaultCategory}
        customTitle={!selectedTransaction ? page.customTitle : undefined}
      />

      <VoucherPrintModal
        show={showPrintModal}
        transaction={printTransaction}
        onHide={() => {
          setShowPrintModal(false);
          setPrintTransaction(null);
        }}
      />

      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={confirmDelete}
        title={`تأكيد إلغاء ${page.one}`}
        body={`هل أنت متأكد من رغبتك في إلغاء هذا ${page.one}؟ يبقى في السجل مع علامة «ملغاة» ولا يُحتسب بعد الآن في المجاميع والتقارير.`}
        confirmVariant="danger"
        confirmText="نعم، إلغاء"
      />

      <ExportModal
        show={showExportModal}
        handleClose={() => setShowExportModal(false)}
        exportType={page.exportType}
        fields={EXPORT_FIELDS}
        title={`تصدير ${page.title}`}
      />

      <ImportModal
        show={showImportModal}
        handleClose={() => setShowImportModal(false)}
        importType={page.importType}
        title={`استيراد ${page.title}`}
      />
    </div>
  );
}

export default TransactionsPage;
