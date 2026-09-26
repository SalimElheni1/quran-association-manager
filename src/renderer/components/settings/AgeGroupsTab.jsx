import React, { useState, useEffect } from 'react';
import { Card, Button, Modal, Form, Row, Col, Spinner, Table, Badge, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';
import ConfirmationModal from '../common/ConfirmationModal';
import EditIcon from '@renderer/components/icons/EditIcon';
import TrashIcon from '@renderer/components/icons/TrashIcon';

const PAYMENT_FREQUENCY_LABELS = { MONTHLY: 'شهري', ANNUAL: 'سنوي' };

const CATEGORY_OPTIONS = [
  { value: 'any', label: 'الكل' },
  { value: 'male_only', label: 'ذكور فقط' },
  { value: 'female_only', label: 'إناث فقط' },
];

const AgeGroupsTab = () => {
  const [ageGroups, setAgeGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    min_age: '',
    max_age: '',
    gender: 'any',
    payment_frequency: 'MONTHLY',
    annual_fee: '',
    monthly_fee: '',
  });
  // Branch fee amounts, used by age groups that leave their own fee empty.
  const [branchFees, setBranchFees] = useState({ annual: 0, monthly: 0 });

  useEffect(() => {
    fetchAgeGroups();
    fetchBranchFees();
    // The branch fees shown as defaults change when the fee settings are saved.
    window.addEventListener('settings-updated', fetchBranchFees);
    return () => window.removeEventListener('settings-updated', fetchBranchFees);
  }, []);

  const fetchBranchFees = async () => {
    try {
      const res = await window.electronAPI.getSettings();
      setBranchFees({
        annual: parseFloat(res?.settings?.annual_fee || 0),
        monthly: parseFloat(res?.settings?.standard_monthly_fee || 0),
      });
    } catch (error) {
      console.error('Error fetching fee settings:', error);
    }
  };

  const formatFee = (groupFee, branchFee) =>
    groupFee === null || groupFee === undefined
      ? `${Number(branchFee).toFixed(2)} (افتراضي)`
      : Number(groupFee).toFixed(2);

  const fetchAgeGroups = async () => {
    try {
      setLoading(true);
      const response = await window.electronAPI.getAgeGroups();
      if (response.success) {
        setAgeGroups(response.ageGroups);
      } else {
        toast.error('فشل في تحميل الفئات العمرية');
      }
    } catch (error) {
      console.error('Error fetching age groups:', error);
      toast.error('حدث خطأ في تحميل الفئات العمرية');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingGroup(null);
    setFormData({
      name: '',
      description: '',
      min_age: '',
      max_age: '',
      gender: 'any',
      payment_frequency: 'MONTHLY',
      annual_fee: '',
      monthly_fee: '',
    });
    setShowModal(true);
  };

  const handleEdit = (group) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      description: group.description || '',
      min_age: group.min_age,
      max_age: group.max_age || '',
      gender: group.gender,
      payment_frequency: group.payment_frequency || 'MONTHLY',
      annual_fee: group.annual_fee ?? '',
      monthly_fee: group.monthly_fee ?? '',
    });
    setShowModal(true);
  };

  const handleDeleteClick = (group) => {
    setGroupToDelete(group);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!groupToDelete) return;

    try {
      const response = await window.electronAPI.deleteAgeGroup(groupToDelete.id);
      if (response.success) {
        toast.success(response.message);
        await fetchAgeGroups();
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      toast.error('حدث خطأ في حذف الفئة العمرية');
    } finally {
      setShowDeleteConfirm(false);
      setGroupToDelete(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const data = {
        ...formData,
        min_age: parseInt(formData.min_age),
        max_age: formData.max_age ? parseInt(formData.max_age) : null,
        // Empty means the group uses the branch fee amounts.
        annual_fee: formData.annual_fee === '' ? null : parseFloat(formData.annual_fee),
        monthly_fee: formData.monthly_fee === '' ? null : parseFloat(formData.monthly_fee),
      };

      let response;
      if (editingGroup) {
        response = await window.electronAPI.updateAgeGroup(editingGroup.id, data);
      } else {
        response = await window.electronAPI.createAgeGroup(data);
      }

      if (response && response.success === true) {
        toast.success(response.message);
        setShowModal(false);
        setSaving(false);
        await fetchAgeGroups();
      } else {
        console.error('Error in handleSubmit:', response);

        toast.error(response?.message || 'حدث خطأ في حفظ الفئة العمرية');
        setSaving(false);
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      toast.error('حدث خطأ في حفظ الفئة العمرية');
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const getGenderBadgeVariant = (gender) => {
    switch (gender) {
      case 'male_only':
        return 'primary';
      case 'female_only':
        return 'success';
      case 'any':
        return 'info';
      default:
        return 'secondary';
    }
  };

  const getGenderLabel = (gender) => {
    const option = CATEGORY_OPTIONS.find((opt) => opt.value === gender);
    return option ? option.label : gender;
  };

  if (loading) {
    return (
      <Card className="border-0">
        <Card.Body className="text-center py-5">
          <Spinner animation="border" />
          <p className="mt-3">جاري تحميل الفئات العمرية...</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-0">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="mb-0">إدارة الفئات العمرية</h6>
            <Button variant="primary" onClick={handleCreate}>
              إضافة فئة جديدة
            </Button>
          </div>

          <Alert variant="info">
            <strong>معلومة:</strong> الفئات العمرية تحل محل نظام التصنيف القديم (أطفال/رجال/نساء)
            وتوفر مرونة أكبر للجمعيات المختلفة.
          </Alert>

          {ageGroups.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <p>لا توجد فئات عمرية محددة</p>
              <p>النظام يستخدم الافتراضيات المدمجة</p>
            </div>
          ) : (
            <Table striped bordered hover responsive>
              <thead className="table-primary">
                <tr>
                  <th>الاسم</th>
                  <th>النطاق العمري</th>
                  <th>النوع</th>
                  <th>نظام الدفع</th>
                  <th>الرسوم السنوية</th>
                  <th>الرسوم الشهرية</th>
                  <th>الوصف</th>
                  <th className="text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {ageGroups.map((group) => (
                  <tr key={group.uuid}>
                    <td className="fw-bold">{group.name}</td>
                    <td>
                      {group.min_age} {group.max_age ? `- ${group.max_age}` : '+'} سنة
                    </td>
                    <td>
                      <Badge bg={getGenderBadgeVariant(group.gender)}>
                        {getGenderLabel(group.gender)}
                      </Badge>
                    </td>
                    <td>{PAYMENT_FREQUENCY_LABELS[group.payment_frequency] || 'شهري'}</td>
                    <td>{formatFee(group.annual_fee, branchFees.annual)}</td>
                    <td>{formatFee(group.monthly_fee, branchFees.monthly)}</td>
                    <td>{group.description || '-'}</td>
                    <td className="text-center">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => handleEdit(group)}
                        className="me-1"
                      >
                        <EditIcon width={16} height={16} className="me-1" /> تعديل
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => handleDeleteClick(group)}
                      >
                        <TrashIcon width={16} height={16} className="me-1" /> حذف
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingGroup ? 'تعديل الفئة العمرية' : 'إضافة فئة عمرية جديدة'}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>
                    اسم الفئة <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="مثال: الأطفال، الناشئون، الشباب"
                    required
                    maxLength={100}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>
                    النوع <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Select
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    required
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Form.Select>
                  <Form.Text className="text-muted">حدد من يمكنه الانضمام لهذه الفئة</Form.Text>
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>
                    العمر الأدنى <span className="text-danger">*</span>
                  </Form.Label>
                  <Form.Control
                    type="number"
                    name="min_age"
                    value={formData.min_age}
                    onChange={handleChange}
                    placeholder="0"
                    min="0"
                    max="100"
                    required
                  />
                  <Form.Text className="text-muted">أصغر سن مسموح للفئة</Form.Text>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>العمر الأقصى</Form.Label>
                  <Form.Control
                    type="number"
                    name="max_age"
                    value={formData.max_age}
                    onChange={handleChange}
                    placeholder="اتركه فارغاً لغير محدود"
                    min="0"
                    max="100"
                  />
                  <Form.Text className="text-muted">أكبر سن مسموح (اتركه فارغاً لـ 100+)</Form.Text>
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>نظام الدفع</Form.Label>
              <Form.Select
                name="payment_frequency"
                value={formData.payment_frequency}
                onChange={handleChange}
              >
                <option value="MONTHLY">شهري (يدفع كل شهر)</option>
                <option value="ANNUAL">سنوي (يدفع مرة واحدة للسنة)</option>
              </Form.Select>
              <Form.Text className="text-muted">
                ينطبق على فصول هذه الفئة: رسوم شهرية، أو الرسم السنوي فقط
              </Form.Text>
            </Form.Group>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>الرسوم السنوية (د.ت)</Form.Label>
                  <Form.Control
                    type="number"
                    name="annual_fee"
                    value={formData.annual_fee}
                    onChange={handleChange}
                    placeholder={`الافتراضي: ${branchFees.annual.toFixed(2)}`}
                    min="0"
                    step="0.01"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>الرسوم الشهرية (د.ت)</Form.Label>
                  <Form.Control
                    type="number"
                    name="monthly_fee"
                    value={formData.monthly_fee}
                    onChange={handleChange}
                    placeholder={`الافتراضي: ${branchFees.monthly.toFixed(2)}`}
                    min="0"
                    step="0.01"
                  />
                </Form.Group>
              </Col>
            </Row>
            <Form.Text className="text-muted d-block mb-3">
              اتركها فارغة لاستعمال رسوم الفرع في إعدادات الرسوم. التغيير يطبق ابتداءً من الفاتورة
              القادمة (الشهر القادم للرسوم الشهرية، والسنة الدراسية القادمة للرسوم السنوية).
            </Form.Text>

            <Form.Group className="mb-3">
              <Form.Label>الوصف</Form.Label>
              <Form.Control
                as="textarea"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="وصف اختياري للفئة العمرية..."
                rows={2}
                maxLength={500}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              إلغاء
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Spinner as="span" animation="border" size="sm" className="me-2" />
                  جارٍ الحفظ...
                </>
              ) : (
                'حفظ'
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <ConfirmationModal
        show={showDeleteConfirm}
        handleClose={() => {
          setShowDeleteConfirm(false);
          setGroupToDelete(null);
        }}
        handleConfirm={handleConfirmDelete}
        title="تأكيد الحذف"
        body={`هل أنت متأكد من حذف الفئة "${groupToDelete?.name}"؟`}
        confirmVariant="danger"
        confirmText="حذف"
      />
    </>
  );
};

export default AgeGroupsTab;
