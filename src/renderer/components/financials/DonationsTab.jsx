import React, { useState, useEffect } from 'react';
import { Table, Button, Spinner, Alert } from 'react-bootstrap';
import DonationFormModal from '@renderer/components/financials/DonationFormModal';
import ConfirmationModal from '@renderer/components/common/ConfirmationModal';
import { error as logError } from '@renderer/utils/logger';
import { getCategoryLabel } from '@renderer/utils/donationCategories';

function DonationsTab({ onInventoryUpdate }) {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingDonation, setEditingDonation] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [donationToDelete, setDonationToDelete] = useState(null);

  const fetchDonations = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getDonations();
      setDonations(result);
      setError(null);
    } catch (err) {
      logError('Failed to fetch donations:', err);
      setError(err.message || 'فشل جلب قائمة التبرعات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDonations();
  }, []);

  const handleShowModal = (donation = null) => {
    setEditingDonation(donation);
    setShowModal(true);
  };

  const handleHideModal = () => {
    setShowModal(false);
    setEditingDonation(null);
  };

  const handleSave = async (formData) => {
    try {
      if (editingDonation) {
        const updatedDonation = await window.electronAPI.updateDonation(formData);
        setDonations(donations.map((d) => (d.id === updatedDonation.id ? updatedDonation : d)));
      } else {
        const newDonation = await window.electronAPI.addDonation(formData);
        setDonations([newDonation, ...donations]);
      }
      handleHideModal();
    } catch (err) {
      logError('Failed to save donation:', err);
      setError(err.message || 'فشل حفظ التبرع.');
    }
  };

  const handleDeleteRequest = (donation) => {
    setDonationToDelete(donation);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!donationToDelete) return;
    try {
      await window.electronAPI.deleteDonation(donationToDelete.id);
      setDonations(donations.filter((d) => d.id !== donationToDelete.id));
    } catch (err) {
      logError('Failed to delete donation:', err);
      setError(err.message || 'فشل حذف التبرع.');
    } finally {
      setShowDeleteModal(false);
      setDonationToDelete(null);
    }
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
        <h4>سجل التبرعات والهبات</h4>
        <Button variant="primary" onClick={() => handleShowModal()}>
          إضافة تبرع
        </Button>
      </div>
      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>#</th>
            <th>اسم المتبرع</th>
            <th>نوع التبرع</th>
            <th>القيمة / الوصف</th>
            <th>تاريخ التبرع</th>
            <th>ملاحظات</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {donations.length > 0 ? (
            donations.map((donation) => (
              <tr key={donation.id}>
                <td>{donation.id}</td>
                <td>{donation.donor_name}</td>
                <td>{donation.donation_type === 'Cash' ? 'نقدي' : 'عيني'}</td>
                <td className="text-start">
                  {donation.donation_type === 'Cash'
                    ? donation.amount
                      ? donation.amount.toFixed(2)
                      : '0.00'
                    : `${donation.description} ${
                        donation.quantity ? `(الكمية: ${donation.quantity})` : ''
                      } ${
                        donation.category ? `(الصنف: ${getCategoryLabel(donation.category)})` : ''
                      }`}
                </td>
                <td>{new Date(donation.donation_date).toLocaleDateString()}</td>
                <td>{donation.notes}</td>
                <td>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="me-2"
                    onClick={() => handleShowModal(donation)}
                  >
                    تعديل
                  </Button>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => handleDeleteRequest(donation)}
                  >
                    حذف
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="7" className="text-center">
                لا توجد تبرعات مسجلة حالياً.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <DonationFormModal
        show={showModal}
        onHide={handleHideModal}
        onSave={handleSave}
        donation={editingDonation}
        onInventoryUpdate={onInventoryUpdate}
      />
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={confirmDelete}
        title="تأكيد حذف التبرع"
        body={`هل أنت متأكد من رغبتك في حذف هذا التبرع؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />
    </div>
  );
}

export default DonationsTab;
