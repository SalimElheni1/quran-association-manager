import React, { useState, useEffect } from 'react';
import { Button, Card, Table, Badge, Modal, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import ConfirmationModal from '@renderer/components/common/ConfirmationModal';
import { error as logError } from '@renderer/utils/logger';

function AccountsPage() {
  const [inKindCategories, setInKindCategories] = useState([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ id: null, name: '' });
  const [categoryToDelete, setCategoryToDelete] = useState(null);

  useEffect(() => {
    loadInKindCategories();
  }, []);

  const loadInKindCategories = async () => {
    try {
      const cats = await window.electronAPI.getInKindCategories();
      setInKindCategories(cats);
    } catch (err) {
      logError('Error loading in-kind categories:', err);
    }
  };

  const handleAddCategory = () => {
    setCategoryForm({ id: null, name: '' });
    setShowCategoryModal(true);
  };

  const handleEditCategory = (cat) => {
    setCategoryForm({ id: cat.id, name: cat.name });
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    try {
      if (categoryForm.id) {
        await window.electronAPI.updateInKindCategory(categoryForm.id, categoryForm.name);
        toast.success('✅ تم تحديث الفئة بنجاح');
      } else {
        await window.electronAPI.addInKindCategory(categoryForm.name);
        toast.success('✅ تم إضافة الفئة بنجاح');
      }
      setShowCategoryModal(false);
      loadInKindCategories();
    } catch (err) {
      logError('Error saving category:', err);
      toast.error('❌ ' + err.message);
    }
  };

  const handleDeleteRequest = (cat) => {
    setCategoryToDelete(cat);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;
    try {
      await window.electronAPI.deleteInKindCategory(categoryToDelete.id);
      toast.success('✅ تم حذف الفئة بنجاح');
      loadInKindCategories();
    } catch (err) {
      logError('Error deleting category:', err);
      toast.error('❌ ' + err.message);
    } finally {
      setShowDeleteModal(false);
      setCategoryToDelete(null);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>إدارة الفئات</h1>
        <Button variant="primary" onClick={handleAddCategory}>
          + إضافة فئة
        </Button>
      </div>

      <Card>
        <Card.Body>
          <Table striped hover>
            <thead>
              <tr>
                <th>اسم الفئة</th>
                <th>النوع</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {inKindCategories.map((cat) => (
                <tr key={cat.id}>
                  <td>{cat.name}</td>
                  <td>
                    <Badge bg={cat.is_system ? 'secondary' : 'primary'}>
                      {cat.is_system ? 'افتراضي' : 'مخصص'}
                    </Badge>
                  </td>
                  <td>
                    {!cat.is_system && (
                      <>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          className="me-2"
                          onClick={() => handleEditCategory(cat)}
                        >
                          تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={() => handleDeleteRequest(cat)}
                        >
                          حذف
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Modal show={showCategoryModal} onHide={() => setShowCategoryModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{categoryForm.id ? 'تعديل فئة' : 'إضافة فئة جديدة'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>اسم الفئة *</Form.Label>
            <Form.Control
              type="text"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              placeholder="مثال: أثاث"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCategoryModal(false)}>
            إلغاء
          </Button>
          <Button variant="primary" onClick={handleSaveCategory} disabled={!categoryForm.name}>
            حفظ
          </Button>
        </Modal.Footer>
      </Modal>

      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={confirmDelete}
        title="تأكيد حذف الفئة"
        body={`هل أنت متأكد من رغبتك في حذف الفئة "${categoryToDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />
    </div>
  );
}

export default AccountsPage;
