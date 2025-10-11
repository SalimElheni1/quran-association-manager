import React, { useState, useEffect } from 'react';
import { Table, Button, Spinner, Alert, Badge } from 'react-bootstrap';
import ReceiptBookFormModal from './ReceiptBookFormModal';
import ConfirmationModal from '@renderer/components/common/ConfirmationModal';
import { error as logError } from '@renderer/utils/logger';

const RECEIPT_TYPES = {
  payment: 'رسوم دراسية',
  donation: 'تبرعات',
  expense: 'مصاريف',
  salary: 'رواتب'
};

const STATUS_VARIANTS = {
  active: 'success',
  completed: 'secondary',
  cancelled: 'danger'
};

const STATUS_LABELS = {
  active: 'نشط',
  completed: 'مكتمل',
  cancelled: 'ملغي'
};

function ReceiptBooksTab() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [bookToDelete, setBookToDelete] = useState(null);

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getReceiptBooks();
      setBooks(result);
      setError(null);
    } catch (err) {
      logError('Failed to fetch receipt books:', err);
      setError(err.message || 'فشل جلب قائمة دفاتر الإيصالات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const handleShowModal = (book = null) => {
    setEditingBook(book);
    setShowModal(true);
  };

  const handleHideModal = () => {
    setShowModal(false);
    setEditingBook(null);
  };

  const handleSave = async (formData) => {
    try {
      if (editingBook) {
        const updatedBook = await window.electronAPI.updateReceiptBook(formData);
        setBooks(books.map((b) => (b.id === updatedBook.id ? updatedBook : b)));
      } else {
        const newBook = await window.electronAPI.addReceiptBook(formData);
        setBooks([newBook, ...books]);
      }
      handleHideModal();
    } catch (err) {
      logError('Failed to save receipt book:', err);
      setError(err.message || 'فشل حفظ دفتر الإيصالات.');
    }
  };

  const handleDeleteRequest = (book) => {
    setBookToDelete(book);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!bookToDelete) return;
    try {
      await window.electronAPI.deleteReceiptBook(bookToDelete.id);
      setBooks(books.filter((b) => b.id !== bookToDelete.id));
    } catch (err) {
      logError('Failed to delete receipt book:', err);
      setError(err.message || 'فشل حذف دفتر الإيصالات.');
    } finally {
      setShowDeleteModal(false);
      setBookToDelete(null);
    }
  };

  const getProgress = (book) => {
    const used = book.current_receipt_number - book.start_receipt_number;
    const total = book.end_receipt_number - book.start_receipt_number + 1;
    return { used, total, percentage: ((used / total) * 100).toFixed(0) };
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
        <h4>إدارة دفاتر الإيصالات</h4>
        <Button variant="primary" onClick={() => handleShowModal()}>
          إضافة دفتر إيصالات
        </Button>
      </div>
      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>#</th>
            <th>رقم الدفتر</th>
            <th>النوع</th>
            <th>نطاق الإيصالات</th>
            <th>الاستخدام</th>
            <th>الحالة</th>
            <th>تاريخ الإصدار</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {books.length > 0 ? (
            books.map((book) => {
              const progress = getProgress(book);
              return (
                <tr key={book.id}>
                  <td>{book.id}</td>
                  <td>{book.book_number}</td>
                  <td>{RECEIPT_TYPES[book.receipt_type]}</td>
                  <td className="text-start">
                    {book.start_receipt_number} - {book.end_receipt_number}
                  </td>
                  <td>
                    {progress.used} / {progress.total} ({progress.percentage}%)
                  </td>
                  <td>
                    <Badge bg={STATUS_VARIANTS[book.status]}>
                      {STATUS_LABELS[book.status]}
                    </Badge>
                  </td>
                  <td>{new Date(book.issued_date).toLocaleDateString()}</td>
                  <td>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      className="me-2"
                      onClick={() => handleShowModal(book)}
                    >
                      تعديل
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDeleteRequest(book)}
                    >
                      حذف
                    </Button>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan="8" className="text-center">
                لا توجد دفاتر إيصالات مسجلة حالياً.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <ReceiptBookFormModal
        show={showModal}
        onHide={handleHideModal}
        onSave={handleSave}
        book={editingBook}
      />
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={confirmDelete}
        title="تأكيد حذف دفتر الإيصالات"
        body="هل أنت متأكد من رغبتك في حذف هذا الدفتر؟ لا يمكن التراجع عن هذا الإجراء."
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />
    </div>
  );
}

export default ReceiptBooksTab;
