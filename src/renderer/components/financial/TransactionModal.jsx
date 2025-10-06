import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { useCategories } from '@renderer/hooks/useCategories';

function TransactionModal({ show, onHide, onSave, transaction, type }) {
  const [formData, setFormData] = useState({});
  const [amountWarning, setAmountWarning] = useState('');
  const [inKindCategories, setInKindCategories] = useState([]);
  const isEditMode = !!transaction;

  const { categories } = useCategories(type);

  // Fetch in-kind categories
  useEffect(() => {
    if (show && type === 'INCOME') {
      window.electronAPI
        .getInKindCategories()
        .then(setInKindCategories)
        .catch(() => {});
    }
  }, [show, type]);

  useEffect(() => {
    const initialData = {
      transaction_date: new Date().toISOString().split('T')[0],
      category: '',
      amount: '',
      description: '',
      payment_method: 'CASH',
      check_number: '',
      voucher_number: '',
      account_id: 1,
      related_person_name: '',
      donor_cin: '',
      receipt_type: '',
      // In-kind donation fields
      item_name: '',
      item_category: '',
      quantity: 1,
      unit_value: 0,
      condition_status: 'New',
    };

    if (isEditMode && transaction) {
      setFormData({
        ...initialData,
        ...transaction,
        transaction_date: transaction.transaction_date
          ? new Date(transaction.transaction_date).toISOString().split('T')[0]
          : initialData.transaction_date,
      });
    } else {
      setFormData(initialData);
    }
  }, [transaction, show, isEditMode]);

  const isInKindDonation = formData.category === 'التبرعات العينية';
  const isCashDonation = formData.category === 'التبرعات النقدية';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Check 500 TND rule (only for monetary transactions)
    if ((name === 'amount' || name === 'payment_method') && !isInKindDonation) {
      const amount = name === 'amount' ? parseFloat(value) : parseFloat(formData.amount);
      const method = name === 'payment_method' ? value : formData.payment_method;

      if (amount > 500 && method === 'CASH') {
        setAmountWarning('⚠️ المبالغ التي تتجاوز 500 دينار يجب أن تكون عبر شيك أو تحويل بنكي');
      } else {
        setAmountWarning('');
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate receipt_type for cash donations
    if (isCashDonation && !formData.receipt_type) {
      return;
    }

    // Validate 500 TND rule (only for monetary transactions)
    if (
      !isInKindDonation &&
      parseFloat(formData.amount) > 500 &&
      formData.payment_method === 'CASH'
    ) {
      return;
    }

    let dataToSave = { ...formData };

    if (isInKindDonation) {
      // Build structured description for in-kind donation
      const inKindDetails = {
        item_name: formData.item_name,
        category: formData.item_category,
        quantity: formData.quantity,
        unit_value: formData.unit_value,
        condition: formData.condition_status,
        total_value: formData.quantity * formData.unit_value,
      };
      dataToSave.description = JSON.stringify(inKindDetails);
      dataToSave.amount = inKindDetails.total_value;
      dataToSave.account_id = 1; // الخزينة
    }

    onSave({ ...dataToSave, type }, transaction ? transaction.id : null);
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg" backdrop="static">
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>
            {isEditMode
              ? type === 'INCOME'
                ? 'تعديل مدخول'
                : 'تعديل مصروف'
              : type === 'INCOME'
                ? 'إضافة مدخول'
                : 'إضافة مصروف'}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <Row>
            <Form.Group as={Col} md="4" className="mb-3">
              <Form.Label>
                التاريخ <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="date"
                name="transaction_date"
                value={formData.transaction_date || ''}
                onChange={handleChange}
                required
              />
            </Form.Group>

            <Form.Group as={Col} md="4" className="mb-3">
              <Form.Label>
                الفئة <span className="text-danger">*</span>
              </Form.Label>
              <Form.Select
                name="category"
                value={formData.category || ''}
                onChange={handleChange}
                required
              >
                <option value="">اختر الفئة</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            
            {!isInKindDonation && (
              <Form.Group as={Col} md="4" className="mb-3">
                <Form.Label>
                  رقم الوصل <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  type="text"
                  name="voucher_number"
                  value={formData.voucher_number || ''}
                  onChange={handleChange}
                  placeholder="مثال: 001"
                  required
                />
              </Form.Group>
            )}
          </Row>

          {type === 'INCOME' && isCashDonation && (
            <Row>
              <Form.Group as={Col} className="mb-3">
                <Form.Label>
                  نوع المدخول <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="receipt_type"
                  value={formData.receipt_type || ''}
                  onChange={handleChange}
                  required
                >
                  <option value="">اختر نوع المدخول</option>
                  <option value="تبرع">تبرع</option>
                  <option value="انخراط">انخراط</option>
                  <option value="نشاط">نشاط</option>
                  <option value="معلوم سنوي">معلوم سنوي</option>
                  <option value="معلوم شهري">معلوم شهري</option>
                </Form.Select>
              </Form.Group>
            </Row>
          )}

          {!isInKindDonation && (
            <Row>
              <Form.Group as={Col} md="6" className="mb-3">
                <Form.Label>
                  المبلغ (دينار) <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  type="number"
                  step="0.001"
                  name="amount"
                  value={formData.amount || ''}
                  onChange={handleChange}
                  required
                />
                {amountWarning && <Form.Text className="text-warning">{amountWarning}</Form.Text>}
              </Form.Group>

              <Form.Group as={Col} md="6" className="mb-3">
                <Form.Label>
                  طريقة الدفع <span className="text-danger">*</span>
                </Form.Label>
                <Form.Select
                  name="payment_method"
                  value={formData.payment_method || 'CASH'}
                  onChange={handleChange}
                  required
                >
                  <option value="CASH">نقدا</option>
                  <option value="CHECK">شيك</option>
                  <option value="TRANSFER">تحويل بنكي</option>
                </Form.Select>
              </Form.Group>
            </Row>
          )}

          {formData.payment_method === 'CHECK' && (
            <Row>
              <Form.Group as={Col} className="mb-3">
                <Form.Label>
                  رقم الشيك <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  type="text"
                  name="check_number"
                  value={formData.check_number || ''}
                  onChange={handleChange}
                  required
                />
              </Form.Group>
            </Row>
          )}

          {isInKindDonation ? (
            <>
              <Row>
                <Form.Group as={Col} md="6" className="mb-3">
                  <Form.Label>
                    اسم الصنف <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    name="item_name"
                    value={formData.item_name || ''}
                    onChange={handleChange}
                    placeholder="مثال: كتب، أثاث، أجهزة..."
                    required
                  />
                </Form.Group>
                <Form.Group as={Col} md="6" className="mb-3">
                  <Form.Label>
                    فئة الصنف <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Select
                    name="item_category"
                    value={formData.item_category || ''}
                    onChange={handleChange}
                    required
                  >
                    <option value="">اختر الفئة</option>
                    {inKindCategories.map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Row>
              <Row>
                <Form.Group as={Col} md="4" className="mb-3">
                  <Form.Label>
                    الكمية <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="number"
                    name="quantity"
                    value={formData.quantity || 1}
                    onChange={handleChange}
                    min="1"
                    required
                  />
                </Form.Group>
                <Form.Group as={Col} md="4" className="mb-3">
                  <Form.Label>قيمة الوحدة (تقديري)</Form.Label>
                  <Form.Control
                    type="number"
                    step="0.001"
                    name="unit_value"
                    value={formData.unit_value || 0}
                    onChange={handleChange}
                  />
                </Form.Group>
                <Form.Group as={Col} md="4" className="mb-3">
                  <Form.Label>الحالة</Form.Label>
                  <Form.Select
                    name="condition_status"
                    value={formData.condition_status || 'New'}
                    onChange={handleChange}
                  >
                    <option value="New">جديد</option>
                    <option value="Good">جيد</option>
                    <option value="Fair">مقبول</option>
                    <option value="Poor">رديء</option>
                  </Form.Select>
                </Form.Group>
              </Row>
            </>
          ) : (
            <Row>
              <Form.Group as={Col} className="mb-3">
                <Form.Label>الوصف</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  name="description"
                  value={formData.description || ''}
                  onChange={handleChange}
                />
              </Form.Group>
            </Row>
          )}

          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>{type === 'INCOME' ? 'اسم المتبرع' : 'المستفيد / الجهة'}</Form.Label>
              <Form.Control
                type="text"
                name="related_person_name"
                value={formData.related_person_name || ''}
                onChange={handleChange}
                placeholder={type === 'INCOME' ? 'اسم المتبرع' : 'مثال: STEG, محمد العربي...'}
              />
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>رقم بطاقة التعريف الوطنية</Form.Label>
              <Form.Control
                type="text"
                name="donor_cin"
                value={formData.donor_cin || ''}
                onChange={handleChange}
                placeholder="CIN (اختياري)"
                maxLength="8"
              />
            </Form.Group>
          </Row>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>
            إلغاء
          </Button>
          <Button variant="primary" type="submit" disabled={!!amountWarning}>
            {isEditMode ? 'حفظ التعديلات' : 'حفظ'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export default TransactionModal;
