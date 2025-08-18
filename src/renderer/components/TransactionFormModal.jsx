import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

// NOTE: This is a basic modal structure. In a real app, you'd use a dedicated modal library
// and have better styling.
const modalBackdropStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
};

const modalContentStyle = {
  backgroundColor: '#fff',
  padding: '20px',
  borderRadius: '8px',
  width: '500px',
  maxWidth: '90%',
};

function TransactionFormModal({ show, onClose, onSave, initialData, isIncomeOnly = false }) {
  const { token, user } = useAuth();
  const [formData, setFormData] = useState({});
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const isEditMode = initialData && initialData.id;

  const incomeCategories = ['tuition', 'donation', 'other'];
  const expenseCategories = ['salary', 'rent', 'utilities', 'supplies', 'other'];

  useEffect(() => {
    if (show) {
      const defaultData = {
        type: 'income', // Default to income
        category: 'tuition',
        amount: '',
        transaction_date: new Date().toISOString().split('T')[0],
        description: '',
        student_id: null,
        teacher_id: null,
        branch_id: 1, // TODO: This should be dynamic based on the logged-in user's branch
      };
      // If in income-only mode, force the type to income
      if (isIncomeOnly) {
          defaultData.type = 'income';
      }
      setFormData(initialData || defaultData);
      setError(null);
    }
  }, [show, initialData, isIncomeOnly]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    let newFormData = { ...formData, [name]: value };
    // If type changes, reset category to a valid one
    if (name === 'type') {
        newFormData.category = value === 'income' ? 'tuition' : 'salary';
    }
    setFormData(newFormData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const dataToSend = {
      ...formData,
      amount: parseFloat(formData.amount) || 0,
      student_id: formData.student_id ? parseInt(formData.student_id, 10) : null,
      teacher_id: formData.teacher_id ? parseInt(formData.teacher_id, 10) : null,
    };

    try {
      if (isEditMode) {
        await window.electronAPI['transactions:update']({
          token,
          id: initialData.id,
          transactionData: dataToSend,
        });
      } else {
        await window.electronAPI['transactions:create']({
          token,
          transactionData: dataToSend,
        });
      }
      onSave(); // Callback to refresh the list
      onClose(); // Close the modal
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!show) {
    return null;
  }

  const categories = formData.type === 'income' ? incomeCategories : expenseCategories;

  return (
    <div style={modalBackdropStyle}>
      <div style={modalContentStyle}>
        <h2>{isIncomeOnly ? 'إضافة دفعة جديدة' : (isEditMode ? 'تعديل المعاملة' : 'إضافة معاملة جديدة')}</h2>
        <form onSubmit={handleSubmit} className="transaction-form">
          {!isIncomeOnly && (
            <div className="form-group">
              <label>النوع</label>
              <select name="type" value={formData.type} onChange={handleChange}>
                <option value="income">دخل</option>
                <option value="expense">صرف</option>
              </select>
            </div>
          )}
          <div className="form-group">
            <label>الفئة</label>
            <select name="category" value={formData.category} onChange={handleChange}>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>المبلغ</label>
            <input type="number" step="0.01" name="amount" value={formData.amount} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>التاريخ</label>
            <input type="date" name="transaction_date" value={new Date(formData.transaction_date).toISOString().split('T')[0]} onChange={handleChange} required />
          </div>

          {/* TODO: Replace with searchable dropdowns */}
          <div className="form-group">
            <label>معرف الطالب (اختياري)</label>
            <input type="number" name="student_id" value={formData.student_id || ''} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>معرف المعلم (اختياري)</label>
            <input type="number" name="teacher_id" value={formData.teacher_id || ''} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label>الوصف</label>
            <textarea name="description" value={formData.description} onChange={handleChange}></textarea>
          </div>

          {error && <p className="error-message">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={isSaving}>
              {isSaving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
            <button type="button" onClick={onClose}>
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TransactionFormModal;
