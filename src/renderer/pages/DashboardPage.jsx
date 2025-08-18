import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import TransactionFormModal from '../components/TransactionFormModal';

function DashboardPage() {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);

  // For the admin, onSave just closes the modal since they can't see the list to refresh.
  const handleSave = () => {
    setShowModal(false);
    // Optionally, show a success message
    alert('تم حفظ الدفعة بنجاح!');
  };

  return (
    <div>
      <h1>لوحة التحكم الرئيسية</h1>
      <p>مرحباً بك في نظام إدارة فروع القرآن الكريم.</p>

      {user?.role === 'Admin' && (
        <div className="quick-actions" style={{ marginTop: '2rem' }}>
          <h2>إجراءات سريعة</h2>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            إضافة دفعة رسوم جديدة
          </button>
        </div>
      )}

      <TransactionFormModal
        show={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        isIncomeOnly={true} // Force the modal into income-only mode for the Admin role
      />
    </div>
  );
}

export default DashboardPage;
