import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Table, Spinner, Alert } from 'react-bootstrap';
import InventoryFormModal from './InventoryFormModal';
import ConfirmationModal from '../ConfirmationModal';
import { toast } from 'react-toastify';

function InventoryTab() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const fetchItems = useCallback(async () => {
    try {
      setIsLoading(true);
      const inventoryItems = await window.electronAPI.getInventoryItems();
      setItems(inventoryItems);
      setError(null);
    } catch (err) {
      setError('فشل في تحميل بيانات المخزون. الرجاء المحاولة مرة أخرى.');
      toast.error('فشل في تحميل بيانات المخزون.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAddItem = () => {
    setSelectedItem(null);
    setShowFormModal(true);
  };

  const handleEditItem = (item) => {
    setSelectedItem(item);
    setShowFormModal(true);
  };

  const handleDeleteRequest = (item) => {
    setSelectedItem(item);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedItem) return;
    try {
      await window.electronAPI.deleteInventoryItem(selectedItem.id);
      toast.success(`تم حذف الصنف "${selectedItem.item_name}" بنجاح.`);
      fetchItems(); // Refresh list
    } catch (err) {
      toast.error('فشل في حذف الصنف.');
      console.error(err);
    } finally {
      setShowDeleteModal(false);
      setSelectedItem(null);
    }
  };

  const handleSave = async (formData) => {
    try {
      if (selectedItem) {
        await window.electronAPI.updateInventoryItem({ ...formData, id: selectedItem.id });
        toast.success('تم تعديل الصنف بنجاح.');
      } else {
        await window.electronAPI.addInventoryItem(formData);
        toast.success('تمت إضافة الصنف بنجاح.');
      }
      fetchItems(); // Refresh list
      setShowFormModal(false);
    } catch (err) {
      toast.error(err.message || 'فشل في حفظ الصنف.');
      console.error(err);
    }
  };


  const renderTableBody = () => {
    if (items.length === 0) {
      return (
        <tr>
          <td colSpan="8" className="text-center">
            لا توجد أصناف في المخزون حالياً.
          </td>
        </tr>
      );
    }

    return items.map((item) => (
      <tr key={item.id}>
        <td>{item.matricule}</td>
        <td>{item.item_name}</td>
        <td>{item.category}</td>
        <td>{item.quantity}</td>
        <td>{item.unit_value ? `${item.unit_value.toFixed(2)}` : 'غير محدد'}</td>
        <td>{item.total_value ? `${item.total_value.toFixed(2)}` : 'غير محدد'}</td>
        <td>{item.location || 'غير محدد'}</td>
        <td>
          <Button variant="outline-primary" size="sm" onClick={() => handleEditItem(item)} className="me-2">
            تعديل
          </Button>
          <Button variant="outline-danger" size="sm" onClick={() => handleDeleteRequest(item)}>
            حذف
          </Button>
        </td>
      </tr>
    ));
  };

  return (
    <>
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h3 className="mb-0">إدارة المخزون</h3>
          <Button variant="primary" onClick={handleAddItem}>
            إضافة صنف جديد
          </Button>
        </Card.Header>
        <Card.Body>
          {isLoading && <div className="text-center"><Spinner animation="border" /></div>}
          {error && <Alert variant="danger">{error}</Alert>}
          {!isLoading && !error && (
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>الرقم التعريفي</th>
                  <th>اسم الصنف</th>
                  <th>الفئة</th>
                  <th>الكمية</th>
                  <th>قيمة الوحدة</th>
                  <th>القيمة الإجمالية</th>
                  <th>الموقع</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>{renderTableBody()}</tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      <InventoryFormModal
        show={showFormModal}
        onHide={() => setShowFormModal(false)}
        onSave={handleSave}
        item={selectedItem}
      />

      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={handleDeleteConfirm}
        title="تأكيد الحذف"
        body={`هل أنت متأكد من رغبتك في حذف الصنف "${selectedItem?.item_name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
      />
    </>
  );
}

export default InventoryTab;
