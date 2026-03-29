import React, { useState, useEffect } from 'react';
import { Table, Button, Spinner, Alert } from 'react-bootstrap';
import ExpenseFormModal from '@renderer/components/financials/ExpenseFormModal';
import TablePagination from '@renderer/components/common/TablePagination';
import ConfirmationModal from '@renderer/components/common/ConfirmationModal';
import { formatTND } from '@renderer/utils/formatCurrency';
import { error as logError } from '@renderer/utils/logger';

function ExpensesTab() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getExpenses();
      setExpenses(result);
      setError(null);
    } catch (err) {
      logError('Failed to fetch expenses:', err);
      setError(err.message || 'فشل جلب قائمة المصاريف.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleShowModal = (expense = null) => {
    setEditingExpense(expense);
    setShowModal(true);
  };

  const handleHideModal = () => {
    setShowModal(false);
    setEditingExpense(null);
  };

  const handleSave = async (formData) => {
    try {
      if (editingExpense) {
        // Update existing expense
        const updatedExpense = await window.electronAPI.updateExpense(formData);
        setExpenses(expenses.map((exp) => (exp.id === updatedExpense.id ? updatedExpense : exp)));
      } else {
        // Add new expense
        const newExpense = await window.electronAPI.addExpense(formData);
        setExpenses([newExpense, ...expenses]);
      }
      handleHideModal();
    } catch (err) {
      logError('Failed to save expense:', err);
      setError(err.message || 'فشل حفظ المصروف.');
    }
  };

  const handleDeleteRequest = (expense) => {
    setExpenseToDelete(expense);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!expenseToDelete) return;
    try {
      await window.electronAPI.deleteExpense(expenseToDelete.id);
      setExpenses(expenses.filter((exp) => exp.id !== expenseToDelete.id));
    } catch (err) {
      logError('Failed to delete expense:', err);
      setError(err.message || 'فشل حذف المصروف.');
    } finally {
      setShowDeleteModal(false);
      setExpenseToDelete(null);
    }
  };

  // Pagination logic
  const totalItems = expenses.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedExpenses = expenses.slice(startIndex, startIndex + pageSize);

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
        <h4>سجل المصاريف والنثريات</h4>
        <Button variant="primary" onClick={() => handleShowModal()}>
          إضافة مصروف
        </Button>
      </div>
      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>#</th>
            <th>الفئة</th>
            <th>المبلغ</th>
            <th>تاريخ الصرف</th>
            <th>المسؤول</th>
            <th>الوصف</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {paginatedExpenses.length > 0 ? (
            paginatedExpenses.map((expense) => (
              <tr key={expense.id}>
                <td>{expense.id}</td>
                <td>{expense.category}</td>
                <td className="text-start">{formatTND(expense.amount, 2)} د.ت</td>
                <td>{new Date(expense.expense_date).toLocaleDateString()}</td>
                <td>{expense.responsible_person}</td>
                <td>{expense.description}</td>
                <td>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="me-2"
                    onClick={() => handleShowModal(expense)}
                  >
                    تعديل
                  </Button>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => handleDeleteRequest(expense)}
                  >
                    حذف
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="7" className="text-center">
                لا توجد مصاريف مسجلة حالياً.
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

      <ExpenseFormModal
        show={showModal}
        onHide={handleHideModal}
        onSave={handleSave}
        expense={editingExpense}
      />
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={confirmDelete}
        title="تأكيد حذف المصروف"
        body={`هل أنت متأكد من رغبتك في حذف هذا المصروف؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />
    </div>
  );
}

export default ExpensesTab;
