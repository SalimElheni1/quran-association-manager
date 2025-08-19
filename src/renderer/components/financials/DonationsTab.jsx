import React, { useState, useEffect } from 'react';
import { Table, Button, Spinner, Alert } from 'react-bootstrap';
import DonationFormModal from './DonationFormModal';

function DonationsTab() {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingDonation, setEditingDonation] = useState(null);

  const fetchDonations = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getDonations();
      setDonations(result);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch donations:', err);
      setError('فشل في جلب قائمة التبرعات.');
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
      console.error('Failed to save donation:', err);
      setError('فشل في حفظ التبرع.');
    }
  };

  const handleDelete = async (donationId) => {
    if (window.confirm('هل أنت متأكد من رغبتك في حذف هذا التبرع؟')) {
      try {
        await window.electronAPI.deleteDonation(donationId);
        setDonations(donations.filter((d) => d.id !== donationId));
      } catch (err) {
        console.error('Failed to delete donation:', err);
        setError('فشل في حذف التبرع.');
      }
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
      {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>قائمة التبرعات</h4>
        <Button variant="primary" onClick={() => handleShowModal()}>إضافة تبرع جديد</Button>
      </div>
      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>#</th>
            <th>اسم المتبرع</th>
            <th>المبلغ</th>
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
                <td>{donation.amount.toFixed(2)}</td>
                <td>{new Date(donation.donation_date).toLocaleDateString()}</td>
                <td>{donation.notes}</td>
                <td>
                  <Button variant="outline-secondary" size="sm" className="me-2" onClick={() => handleShowModal(donation)}>
                    تعديل
                  </Button>
                  <Button variant="outline-danger" size="sm" onClick={() => handleDelete(donation.id)}>
                    حذف
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="6" className="text-center">
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
      />
    </div>
  );
}

export default DonationsTab;
