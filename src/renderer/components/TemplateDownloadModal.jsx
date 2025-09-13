import React, { useState } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';

const TemplateDownloadModal = ({ show, onHide, columnMappings }) => {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState('');

  const handleDownload = async () => {
    if (!selectedTemplate) {
      setError('يرجى اختيار نوع القالب الذي تريد تحميله.');
      return;
    }
    setError('');
    setIsDownloading(true);
    const result = await window.electronAPI.downloadTemplate(selectedTemplate);
    if (result.success) {
      toast.success('تم تحميل القالب بنجاح!');
      onHide();
    } else {
      // Don't show an error if the user just canceled the dialog
      if (result.message.includes('تم إلغاء عملية الحفظ')) {
        onHide();
      } else {
        setError(result.message);
      }
    }
    setIsDownloading(false);
  };

  const handleEnter = () => {
    // Reset state when modal is opened
    setSelectedTemplate('');
    setError('');
    setIsDownloading(false);
  };

  return (
    <Modal show={show} onHide={onHide} onEnter={handleEnter} centered>
      <Modal.Header closeButton>
        <Modal.Title>تحميل قالب استيراد</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <p>اختر نوع البيانات التي ترغب في استيرادها لتحميل القالب المناسب.</p>
        <Form.Group>
          <Form.Label>اختر نوع القالب</Form.Label>
          <Form.Select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
          >
            <option value="">-- اختر --</option>
            {columnMappings &&
              Object.entries(columnMappings).map(([typeKey, config]) => (
                <option key={typeKey} value={typeKey}>
                  {config.displayName}
                </option>
              ))}
          </Form.Select>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          إغلاق
        </Button>
        <Button
          variant="primary"
          onClick={handleDownload}
          disabled={!selectedTemplate || isDownloading}
        >
          {isDownloading ? 'جاري التحميل...' : 'تحميل'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default TemplateDownloadModal;
