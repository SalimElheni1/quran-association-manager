import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Form, Col, Row, InputGroup } from 'react-bootstrap';
import { toast } from 'react-toastify';

const initialDonationData = {
  donor_name: '',
  amount: '',
  donation_date: new Date().toISOString().split('T')[0],
  donation_type: 'Cash',
  description: '',
  notes: '',
  quantity: 1,
  category: '',
  // For new inventory item
  unit_value: 0,
  condition_status: 'New',
  location: '',
};

const ADD_NEW_ITEM_VALUE = 'add-new-item';

function DonationFormModal({ show, onHide, onSave, donation, onInventoryUpdate }) {
  const [formData, setFormData] = useState(initialDonationData);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('');

  const [isUnique, setIsUnique] = useState(true);
  const [itemNameForCheck, setItemNameForCheck] = useState('');

  const isEditMode = donation != null;

  // Debounce for uniqueness check
  useEffect(() => {
    const handler = setTimeout(() => {
      if (itemNameForCheck) {
        checkUniqueness(itemNameForCheck);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [itemNameForCheck]);

  const checkUniqueness = useCallback(async (name) => {
    if (!name) return;
    const { isUnique: unique } = await window.electronAPI.checkInventoryItemUniqueness({ itemName: name });
    setIsUnique(unique);
  }, []);

  // Fetch inventory items for the dropdown
  useEffect(() => {
    if (show && formData.donation_type === 'In-kind') {
      window.electronAPI.getInventoryItems()
        .then(setInventoryItems)
        .catch(err => toast.error('فشل في تحميل أصناف المخزون.'));
    }
  }, [show, formData.donation_type]);

  // Effect to handle form reset and population for edit mode
  useEffect(() => {
    if (show) {
      if (isEditMode) {
        // Edit mode is complex with this new flow, for now, we reset
        // and don't support editing in-kind donations that modify inventory.
        setFormData({
          ...initialDonationData,
          ...donation,
          donation_date: new Date(donation.donation_date).toISOString().split('T')[0],
        });
      } else {
        setFormData(initialDonationData);
      }
      setSelectedItemId('');
      setIsUnique(true);
      setItemNameForCheck('');
    }
  }, [donation, isEditMode, show]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === 'donation_type' && value === 'Cash') {
      setSelectedItemId('');
    }

    if (name === 'description') {
      setItemNameForCheck(value);
    }
  };

  const handleItemSelection = (e) => {
    const itemId = e.target.value;
    setSelectedItemId(itemId);

    if (itemId === ADD_NEW_ITEM_VALUE) {
      setFormData(prev => ({ ...prev, description: '', category: '' }));
    } else {
      const selected = inventoryItems.find(it => it.id.toString() === itemId);
      if (selected) {
        setFormData(prev => ({ ...prev, description: selected.item_name, category: selected.category }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let dataToSave = { ...formData };

    if (dataToSave.donation_type === 'Cash') {
      dataToSave.description = null;
      dataToSave.quantity = null;
      dataToSave.category = null;
      onSave(dataToSave);
      return;
    }

    // In-kind donation logic
    dataToSave.amount = null;

    try {
      if (selectedItemId && selectedItemId !== ADD_NEW_ITEM_VALUE) {
        // --- Update existing inventory item ---
        const itemToUpdate = await window.electronAPI.getInventoryItems().then(items => items.find(i => i.id.toString() === selectedItemId));
        if (!itemToUpdate) throw new Error('لم يتم العثور على الصنف المحدد.');

        const newQuantity = Number(itemToUpdate.quantity) + Number(formData.quantity);
        await window.electronAPI.updateInventoryItem({ ...itemToUpdate, quantity: newQuantity });

        dataToSave.inventory_item_id = itemToUpdate.id;
        toast.success(`تم تحديث كمية "${itemToUpdate.item_name}" بنجاح.`);
        if (onInventoryUpdate) onInventoryUpdate();

      } else if (selectedItemId === ADD_NEW_ITEM_VALUE) {
        // --- Add new inventory item ---
        if (!isUnique) {
          toast.error('لا يمكن الإضافة، هذا الصنف موجود بالفعل.');
          return;
        }
        const newItemData = {
          item_name: formData.description,
          category: formData.category,
          quantity: formData.quantity,
          unit_value: formData.unit_value,
          acquisition_date: formData.donation_date,
          acquisition_source: `تبرع من ${formData.donor_name}`,
          condition_status: formData.condition_status,
          location: formData.location,
          notes: formData.notes,
        };
        const newInventoryItem = await window.electronAPI.addInventoryItem(newItemData);
        dataToSave.inventory_item_id = newInventoryItem.id;
        toast.success(`تمت إضافة "${newInventoryItem.item_name}" للمخزون بنجاح.`);
        if (onInventoryUpdate) onInventoryUpdate();
      }

      onSave(dataToSave);

    } catch (err) {
      toast.error(err.message || 'حدث خطأ أثناء معالجة التبرع العيني.');
      console.error(err);
    }
  };

  const renderInKindFields = () => (
    <>
      <Form.Group className="mb-3">
        <Form.Label>الصنف الموجود في المخزون</Form.Label>
        <Form.Select value={selectedItemId} onChange={handleItemSelection}>
          <option value="">اختر صنفاً أو أضف جديداً</option>
          <option value={ADD_NEW_ITEM_VALUE}>إضافة صنف جديد...</option>
          {inventoryItems.map(item => (
            <option key={item.id} value={item.id}>
              {item.item_name} (الكمية الحالية: {item.quantity})
            </option>
          ))}
        </Form.Select>
      </Form.Group>

      {selectedItemId === ADD_NEW_ITEM_VALUE ? (
        // --- Fields for NEW item ---
        <div className="p-3 mb-3 border rounded">
          <h5>تفاصيل الصنف الجديد</h5>
          <Form.Group className="mb-3">
            <Form.Label>اسم الصنف الجديد<span className="text-danger">*</span></Form.Label>
            <InputGroup hasValidation>
              <Form.Control
                type="text"
                name="description"
                value={formData.description}
                onChange={handleChange}
                required
                isInvalid={!isUnique}
              />
              <Form.Control.Feedback type="invalid">
                هذا الصنف موجود بالفعل في المخزون.
              </Form.Control.Feedback>
            </InputGroup>
          </Form.Group>
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>فئة الصنف</Form.Label>
                <Form.Control type="text" name="category" value={formData.category} onChange={handleChange} />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>قيمة الوحدة التقديرية</Form.Label>
                <Form.Control type="number" name="unit_value" value={formData.unit_value} onChange={handleChange} />
              </Form.Group>
            </Col>
          </Row>
        </div>
      ) : (
        // --- Field for EXISTING item ---
        <Form.Group className="mb-3">
          <Form.Label>وصف التبرع</Form.Label>
          <Form.Control as="textarea" rows={2} name="description" value={formData.description} readOnly />
        </Form.Group>
      )}

      <Form.Group className="mb-3">
        <Form.Label>الكمية المتبرع بها<span className="text-danger">*</span></Form.Label>
        <Form.Control
          type="number"
          name="quantity"
          value={formData.quantity}
          onChange={handleChange}
          required
          min="1"
        />
      </Form.Group>
    </>
  );

  return (
    <Modal show={show} onHide={onHide} centered backdrop="static" size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{isEditMode ? 'تعديل تبرع' : 'إضافة تبرع جديد'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>اسم المتبرع<span className="text-danger">*</span></Form.Label>
            <Form.Control type="text" name="donor_name" value={formData.donor_name} onChange={handleChange} required />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>نوع التبرع<span className="text-danger">*</span></Form.Label>
            <Form.Control as="select" name="donation_type" value={formData.donation_type} onChange={handleChange} disabled={isEditMode}>
              <option value="Cash">نقدي</option>
              <option value="In-kind">عيني</option>
            </Form.Control>
          </Form.Group>

          {formData.donation_type === 'Cash' ? (
            <Form.Group className="mb-3">
              <Form.Label>المبلغ<span className="text-danger">*</span></Form.Label>
              <Form.Control type="number" name="amount" value={formData.amount} onChange={handleChange} required />
            </Form.Group>
          ) : (
            renderInKindFields()
          )}

          <Form.Group className="mb-3">
            <Form.Label>تاريخ التبرع<span className="text-danger">*</span></Form.Label>
            <Form.Control type="date" name="donation_date" value={formData.donation_date} onChange={handleChange} required />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>ملاحظات إضافية</Form.Label>
            <Form.Control as="textarea" rows={3} name="notes" value={formData.notes} onChange={handleChange} />
          </Form.Group>

          <div className="d-grid">
            <Button variant="primary" type="submit" disabled={formData.donation_type === 'In-kind' && selectedItemId === ADD_NEW_ITEM_VALUE && !isUnique}>
              {isEditMode ? 'حفظ التعديلات' : 'إضافة التبرع'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

export default DonationFormModal;
