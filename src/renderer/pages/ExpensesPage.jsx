import React, { useState } from 'react';
import { Button, Card } from 'react-bootstrap';
import { toast } from 'react-toastify';
import TransactionTable from '@renderer/components/financial/TransactionTable';
import TransactionFilters from '@renderer/components/financial/TransactionFilters';
import TransactionModal from '@renderer/components/financial/TransactionModal';
import VoucherPrintModal from '@renderer/components/financial/VoucherPrintModal';
import ConfirmationModal from '@renderer/components/ConfirmationModal';
import { useTransactions } from '@renderer/hooks/useTransactions';
import { error as logError } from '@renderer/utils/logger';

function ExpensesPage() {
  const [filters, setFilters] = useState({ type: 'EXPENSE' });
  const [showModal, setShowModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactionToDelete, setTransactionToDelete] = useState(null);
  
  const { transactions, loading, refresh } = useTransactions(filters);

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
        toast.success('✅ تم تحديث المصروف بنجاح');
      } else {
        await window.electronAPI.addTransaction(transaction);
        toast.success('✅ تم إضافة المصروف بنجاح');
      }
      setShowModal(false);
      refresh();
      window.dispatchEvent(new Event('financial-data-changed'));
    } catch (err) {
      logError('Error saving expense:', err);
      toast.error(err.message || '❌ فشل في حفظ المصروف');
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
      toast.success('✅ تم حذف المصروف بنجاح');
      refresh();
      window.dispatchEvent(new Event('financial-data-changed'));
    } catch (err) {
      logError('Error deleting expense:', err);
      toast.error('❌ فشل في حذف المصروف');
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
        <h1>المصاريف</h1>
        <Button variant="primary" onClick={handleAdd}>
          + إضافة مصروف
        </Button>
      </div>

      <Card>
        <Card.Body>
          <TransactionFilters
            type="EXPENSE"
            filters={filters}
            onChange={setFilters}
          />
          
          <TransactionTable
            transactions={transactions}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDeleteRequest}
            onPrint={handlePrint}
          />
        </Card.Body>
      </Card>

      <TransactionModal
        show={showModal}
        type="EXPENSE"
        transaction={selectedTransaction}
        onHide={() => setShowModal(false)}
        onSave={handleSave}
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
        title="تأكيد حذف المصروف"
        body="هل أنت متأكد من رغبتك في حذف هذا المصروف؟ لا يمكن التراجع عن هذا الإجراء."
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />
    </div>
  );
}

export default ExpensesPage;
