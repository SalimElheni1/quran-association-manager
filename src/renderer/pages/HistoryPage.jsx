import React, { useState, useEffect, useCallback } from 'react';
import { Button, Table, Spinner, Alert } from 'react-bootstrap';
import { FaTrash, FaRedo } from 'react-icons/fa';
import ConfirmationModal from '../components/ConfirmationModal';
import { toast } from 'react-toastify';

function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedHistory = await window.electron.ipcRenderer.invoke('history:get');
      setHistory(fetchedHistory);
      setError(null);
    } catch (err) {
      setError('فشل في تحميل سجل التصدير.');
      toast.error('فشل في تحميل سجل التصدير.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await window.electron.ipcRenderer.invoke('history:delete', itemToDelete.id);
      toast.success('تم حذف سجل التصدير بنجاح.');
      fetchHistory(); // Refresh list
    } catch (err) {
      toast.error('فشل في حذف سجل التصدير.');
    } finally {
      setShowConfirm(false);
      setItemToDelete(null);
    }
  };

  const handleRegenerate = async (item) => {
    try {
      const result = await window.electron.ipcRenderer.invoke('history:regenerate', item.id);
      if (result.success) {
        toast.success(`تم إعادة إنشاء الملف بنجاح في: ${result.filePath}`);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      toast.error(`فشل في إعادة إنشاء الملف: ${err.message}`);
    }
  };

  return (
    <div className="page-container">
      <h2>سجل التصدير</h2>
      <p>
        هنا يمكنك عرض عمليات التصدير السابقة، إعادة إنشائها، أو حذفها.
      </p>

      {isLoading && <Spinner animation="border" />}
      {error && <Alert variant="danger">{error}</Alert>}

      {!isLoading && !error && (
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>نوع التصدير</th>
              <th>التنسيق</th>
              <th>تاريخ التصدير</th>
              <th>الفلاتر المطبقة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.id}>
                <td>{item.export_type}</td>
                <td>{item.format}</td>
                <td>{new Date(item.created_at).toLocaleString()}</td>
                <td>{item.filters ? JSON.stringify(item.filters) : 'لا يوجد'}</td>
                <td>
                  <Button variant="info" size="sm" onClick={() => handleRegenerate(item)} className="me-2">
                    <FaRedo /> إعادة إنشاء
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDeleteClick(item)}>
                    <FaTrash /> حذف
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <ConfirmationModal
        show={showConfirm}
        onConfirm={confirmDelete}
        onCancel={() => setShowConfirm(false)}
        title="تأكيد الحذف"
        message={`هل أنت متأكد أنك تريد حذف هذا السجل؟`}
      />
    </div>
  );
}

export default HistoryPage;
