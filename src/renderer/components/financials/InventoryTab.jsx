import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Table, Spinner, Alert } from 'react-bootstrap';
import TablePagination from '../common/TablePagination';
import InventoryFormModal from './InventoryFormModal';
import TransactionModal from '../financial/TransactionModal';
import ConfirmationModal from '../common/ConfirmationModal';
import ExportModal from '@renderer/components/modals/ExportModal';
import ImportModal from '@renderer/components/modals/ImportModal';
import { toast } from 'react-toastify';
import { error as logError } from '@renderer/utils/logger';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { PERMISSIONS } from '@renderer/utils/permissions';
import ExportIcon from '@renderer/components/icons/ExportIcon';
import ImportIcon from '@renderer/components/icons/ImportIcon';

const inventoryFields = [
  { key: 'matricule', label: 'الرقم التعريفي' },
  { key: 'item_name', label: 'اسم الصنف' },
  { key: 'category', label: 'الفئة' },
  { key: 'quantity', label: 'الكمية' },
  { key: 'unit_value', label: 'قيمة الوحدة' },
  { key: 'total_value', label: 'القيمة الإجمالية' },
  { key: 'acquisition_source', label: 'مصدر الاقتناء' },
];

function InventoryTab() {
  const { hasPermission } = usePermissions();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [filters, setFilters] = useState({ page: 1, limit: 25 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showInKindModal, setShowInKindModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await window.electronAPI.getInventoryItems(filters);

      if (result && typeof result === 'object' && result.items) {
        setItems(result.items);
        setPagination({
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        });
      } else {
        const itemsArray = Array.isArray(result) ? result : [];
        setItems(itemsArray);

        setPagination({
          total: itemsArray.length,
          page: 1,
          limit: filters.limit || 25,
          totalPages: Math.ceil(itemsArray.length / (filters.limit || 25)),
        });
      }
      setError(null);
    } catch (err) {
      setError('فشل في تحميل بيانات المخزون. الرجاء المحاولة مرة أخرى.');
      toast.error('فشل في تحميل بيانات المخزون.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Listen for import completion events to refresh data
  useEffect(() => {
    const handleImportCompleted = (payload) => {
      // Check if inventory data was imported (UI sheet name is 'الجرد')
      if (payload.sheets && payload.sheets.includes('الجرد')) {
        fetchItems();
      }
    };

    const unsubscribe = window.electronAPI.onImportCompleted(handleImportCompleted);

    return unsubscribe;
  }, []);

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

  const handleInKindSave = async (data) => {
    try {
      await window.electronAPI.addTransaction({ ...data, type: 'INCOME' });

      const inKindDetails = JSON.parse(data.description);
      const inventoryData = {
        item_name: inKindDetails.item_name,
        category: inKindDetails.category,
        quantity: inKindDetails.quantity,
        unit_value: inKindDetails.unit_value,
        location: '', // default
        notes: '',
        acquisition_date: data.transaction_date,
        acquisition_source: 'تبرع',
        condition_status: inKindDetails.condition,
      };
      await window.electronAPI.addInventoryItem(inventoryData);

      toast.success('✅ تم إضافة التبرع العيني بنجاح');
      setShowInKindModal(false);
      fetchItems();
    } catch (err) {
      logError('Error saving in-kind donation:', err);
      toast.error('❌ فشل في حفظ التبرع العيني');
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
        <td>{item.acquisition_source || 'غير محدد'}</td>
        <td>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => handleEditItem(item)}
            className="me-2"
          >
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
          <h3 className="mb-0">الجرد</h3>
          <div className="d-flex gap-2">
            {hasPermission(PERMISSIONS.FINANCIALS_VIEW) && (
              <Button variant="outline-primary" onClick={() => setShowExportModal(true)}>
                <ExportIcon className="ms-2" /> تصدير البيانات
              </Button>
            )}
            {hasPermission(PERMISSIONS.FINANCIALS_MANAGE) && (
              <Button variant="outline-success" onClick={() => setShowImportModal(true)}>
                <ImportIcon className="ms-2" /> استيراد البيانات
              </Button>
            )}
            <Button variant="primary" onClick={handleAddItem}>
              إضافة صنف جديد
            </Button>
            <Button variant="success" onClick={() => setShowInKindModal(true)}>
              إضافة تبرع عيني
            </Button>
          </div>
        </Card.Header>
        <Card.Body>
          {isLoading && (
            <div className="text-center">
              <Spinner animation="border" />
            </div>
          )}
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
                  <th>مصدر الاقتناء</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>{renderTableBody()}</tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {pagination && (
        <TablePagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.total}
          pageSize={pagination.limit}
          onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          onPageSizeChange={(pageSize, page) =>
            setFilters((prev) => ({ ...prev, limit: pageSize, page }))
          }
        />
      )}

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

      <TransactionModal
        show={showInKindModal}
        type="INCOME"
        transaction={null}
        onHide={() => setShowInKindModal(false)}
        onSave={handleInKindSave}
        defaultCategory="التبرعات العينية"
        customTitle="إضافة تبرع عيني"
      />

      <ExportModal
        show={showExportModal}
        handleClose={() => setShowExportModal(false)}
        exportType="inventory"
        fields={inventoryFields}
        title="تصدير بيانات الجرد"
      />

      <ImportModal
        show={showImportModal}
        handleClose={() => setShowImportModal(false)}
        importType="الجرد"
        title="استيراد بيانات الجرد"
      />
    </>
  );
}

export default InventoryTab;
