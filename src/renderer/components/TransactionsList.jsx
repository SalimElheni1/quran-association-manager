import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

function TransactionsList({ onEdit, onDelete, fetchTrigger }) {
  const { token } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    searchTerm: '',
    type: '',
    category: '',
    startDate: '',
    endDate: '',
  });

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    limit: 15,
  });

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { transactions, totalCount } = await window.electronAPI['transactions:list']({
        token,
        filters: { ...filters, page: pagination.currentPage, limit: pagination.limit },
      });
      setTransactions(transactions);
      setPagination(prev => ({ ...prev, totalPages: Math.ceil(totalCount / prev.limit) || 1 }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, filters, pagination.currentPage, pagination.limit]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions, fetchTrigger]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, currentPage: 1 })); // Reset to first page on filter change
  };

  const handleSearch = (e) => {
      e.preventDefault();
      fetchTransactions();
  }

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, currentPage: newPage }));
    }
  };

  const handlePrintReceipt = async (transactionId) => {
    try {
      await window.electronAPI['transactions:generate-receipt']({ token, transactionId });
    } catch (error) {
      console.error('Failed to generate receipt:', error);
      alert(`فشل طباعة الإيصال: ${error.message}`);
    }
  };

  return (
    <div className="transactions-list">
      {/* Filter Controls */}
      <form onSubmit={handleSearch} className="filters-form">
        <input
          type="text"
          name="searchTerm"
          placeholder="بحث بالوصف, طالب, أو معلم..."
          value={filters.searchTerm}
          onChange={handleFilterChange}
        />
        {/* Add more filter controls for date, type, category as needed */}
        <button type="submit">بحث</button>
      </form>

      {loading && <p>جاري التحميل...</p>}
      {error && <p className="error-message">{error}</p>}

      {!loading && !error && (
        <>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>النوع</th>
                  <th>الفئة</th>
                  <th>المبلغ</th>
                  <th>الوصف</th>
                  <th>مرتبط بـ</th>
                  <th>سجل بواسطة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length > 0 ? transactions.map(t => (
                  <tr key={t.id}>
                    <td>{new Date(t.transaction_date).toLocaleDateString()}</td>
                    <td>{t.type === 'income' ? 'دخل' : 'صرف'}</td>
                    <td>{t.category}</td>
                    <td>{t.amount.toFixed(2)}</td>
                    <td>{t.description}</td>
                    <td>{t.student_name || t.teacher_name || '-'}</td>
                    <td>{t.recorded_by_username}</td>
                    <td>
                      <button onClick={() => onEdit(t)}>تعديل</button>
                      <button onClick={() => onDelete(t.id)}>حذف</button>
                      <button onClick={() => handlePrintReceipt(t.id)}>طباعة</button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="8">لا توجد معاملات لعرضها.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="pagination">
            <button onClick={() => handlePageChange(pagination.currentPage - 1)} disabled={pagination.currentPage === 1}>
              السابق
            </button>
            <span>
              صفحة {pagination.currentPage} من {pagination.totalPages}
            </span>
            <button onClick={() => handlePageChange(pagination.currentPage + 1)} disabled={pagination.currentPage >= pagination.totalPages}>
              التالي
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default TransactionsList;
