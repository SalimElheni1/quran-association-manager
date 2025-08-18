import React, { useState } from 'react';
import TransactionsList from '../components/TransactionsList';
import TransactionFormModal from '../components/TransactionFormModal';
import { useAuth } from '../contexts/AuthContext';

function FinancialsPage() {
  const { token } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  // This state is used as a simple way to trigger a refetch in the child component
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const handleOpenAddModal = () => {
    setEditingTransaction(null);
    setShowModal(true);
  };

  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('هل أنت متأكد أنك تريد حذف هذه المعاملة؟')) {
      try {
        await window.electronAPI['transactions:delete']({ token, id });
        setFetchTrigger(prev => prev + 1); // Trigger a refetch
      } catch (error) {
        console.error('Failed to delete transaction:', error);
        alert(`فشل حذف المعاملة: ${error.message}`);
      }
    }
  };

  const handleSave = () => {
    setFetchTrigger(prev => prev + 1); // Trigger a refetch to show the new/updated data
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>المالية</h1>
        <button onClick={handleOpenAddModal} className="btn-primary">إضافة معاملة جديدة</button>
      </div>

      <TransactionsList
        onEdit={handleEdit}
        onDelete={handleDelete}
        fetchTrigger={fetchTrigger}
      />

      <TransactionFormModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        initialData={editingTransaction}
      />
    </div>
  );
}

export default FinancialsPage;
