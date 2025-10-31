import React, { useState } from 'react';
import { Modal, Button, Alert } from 'react-bootstrap';
import ImportWizard from '@renderer/components/ImportWizard';
import FileExcelIcon from '@renderer/components/icons/FileExcelIcon';
import MagicIcon from '@renderer/components/icons/MagicIcon';
import ExclamationTriangleIcon from '@renderer/components/icons/ExclamationTriangleIcon';

const ImportModal = ({ show, handleClose, importType, title }) => {
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const handleGenerateTemplate = async () => {
    setIsLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const result = await window.electronAPI.generateImportTemplate({ sheetName: importType });
      if (result.success) {
        setMessage({ type: 'success', text: 'تم إنشاء القالب بنجاح!' });
      } else {
        setMessage({ type: 'danger', text: `فشل إنشاء القالب: ${result.message}` });
      }
    } catch (error) {
      setMessage({ type: 'danger', text: `حدث خطأ: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Modal show={show} onHide={handleClose} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            قم بإنشاء قالب Excel، واملأه بالبيانات، ثم قم باستيراده لإضافة سجلات متعددة دفعة واحدة.
          </p>

          <div className="mb-4">
            <div className="text-center">
              <Button
                variant="success"
                size="lg"
                onClick={handleGenerateTemplate}
                disabled={isLoading}
                className="px-4"
              >
                <FileExcelIcon className="me-2" />
                إنشاء قالب Excel
              </Button>
              <p className="text-muted small mt-2 mb-0">
                قم بإنشاء قالب Excel فارغ يحتوي على الأعمدة المطلوبة.
              </p>
            </div>
          </div>

          <hr className="my-4" />

          <div className="mb-4">
            <div className="text-center">
              <Button
                variant="primary"
                size="lg"
                onClick={() => setShowWizard(true)}
                disabled={isLoading}
                className="px-5"
              >
                <MagicIcon className="me-2" />
                بدء معالج الاستيراد
              </Button>
            </div>
          </div>

          {message.text && <Alert variant={message.type}>{message.text}</Alert>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            إغلاق
          </Button>
        </Modal.Footer>
      </Modal>

      <ImportWizard
        show={showWizard}
        handleClose={() => setShowWizard(false)}
        selectedSheets={[importType]}
      />
    </>
  );
};

export default ImportModal;
