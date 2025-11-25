import React, { useState } from 'react';
import { Modal, Button, Alert, Spinner, Form, InputGroup } from 'react-bootstrap';

function ImportWizard({ show, handleClose, selectedSheets = [] }) {
  const [filePath, setFilePath] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState('select'); // 'select' | 'import'

  const handleFileSelect = async () => {
    try {
      const result = await window.electronAPI.openFileDialog({
        title: 'اختر ملف Excel للاستيراد',
        filters: [
          { name: 'ملفات Excel', extensions: ['xlsx', 'xls'] },
          { name: 'جميع الملفات', extensions: ['*'] },
        ],
      });

      if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
        setFilePath(result.filePaths[0]);
        // Automatically start import after file selection
        setTimeout(() => handleImport(result.filePaths[0]), 500);
      } else {
        // File selection cancelled or no file selected
      }
    } catch (err) {
      setError('خطأ في اختيار الملف: ' + err.message);
    }
  };

  const handleImport = async (importFilePath = null) => {
    const pathToUse = importFilePath || filePath;
    if (!pathToUse || selectedSheets.length === 0) {
      // Import cancelled
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setCurrentStep('import');

    try {
      const response = await window.electronAPI.importExcel(pathToUse, selectedSheets);

      if (response.success) {
        setResult(response.data);
        try {
          // Notify the app that an import completed so pages can refresh if needed
          window.dispatchEvent(
            new CustomEvent('app:import-completed', {
              detail: { sheets: selectedSheets, results: response.data },
            }),
          );
        } catch (e) {
          console.warn('Failed to dispatch import-completed event', e);
        }
      } else {
        setError(response.message || 'فشل في عملية الاستيراد');
      }
    } catch (err) {
      console.error('Import error:', err);
      setError('حدث خطأ أثناء الاستيراد: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setFilePath('');
    setResult(null);
    setError(null);
    setLoading(false);
    setCurrentStep('select');
    handleClose();
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setFilePath('');
    setCurrentStep('select');
  };

  return (
    <Modal show={show} onHide={handleCloseModal} size="lg" backdrop="static">
      <Modal.Header closeButton={!loading}>
        <Modal.Title>
          <i className="fas fa-file-excel me-2"></i>
          استيراد البيانات من Excel
          {selectedSheets.length > 0 && (
            <span className="badge bg-primary ms-2">{selectedSheets.length} ورقة</span>
          )}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* File Selection Step */}
        {currentStep === 'select' && (
          <div className="text-center py-4">
            <h5>اختر ملف Excel للاستيراد</h5>
            <p className="text-muted">سيتم استيراد بيانات الورقات المحددة من الملف المختار</p>

            <div className="mb-4">
              <Button variant="primary" onClick={handleFileSelect} className="px-4">
                <i className="fas fa-folder-open me-2"></i>
                تصفح الملفات
              </Button>
            </div>

            {selectedSheets.length > 0 && (
              <Alert variant="info">
                <strong>الورقات المراد استيرادها:</strong>
                <div className="mt-2">
                  {selectedSheets.map((sheet, index) => (
                    <span key={sheet} className="badge bg-secondary me-2">
                      {sheet}
                    </span>
                  ))}
                </div>
              </Alert>
            )}

            <small className="text-muted">يرجى التأكد من أن الملف يحتوي على الورقات المطلوبة</small>
          </div>
        )}

        {/* Import Progress Step */}
        {currentStep === 'import' && loading && (
          <div className="text-center py-4">
            <Spinner animation="border" variant="primary" className="mb-3" />
            <h5>جاري استيراد البيانات...</h5>
            <p className="text-muted">الرجاء الانتظار حتى انتهاء عملية الاستيراد</p>
            {filePath && (
              <small className="text-muted d-block">الملف: {filePath.split('\\').pop()}</small>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <Alert variant="danger">
            <i className="fas fa-exclamation-triangle me-2"></i>
            {error}
          </Alert>
        )}

        {/* Success Results */}
        {result && (
          <div>
            <div className="row text-center mb-4">
              <div className="col">
                <h4 className="text-success">
                  <i className="fas fa-check-circle me-2"></i>
                  تم الاستيراد بنجاح
                </h4>
              </div>
            </div>

            <div className="row">
              <div className="col-md-6">
                <div className="card border-success">
                  <div className="card-body text-center">
                    <div className="display-4 text-success fw-bold">{result.successCount}</div>
                    <div className="text-muted">سجل ناجح</div>
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                {result.errorCount > 0 ? (
                  <div className="card border-warning">
                    <div className="card-body text-center">
                      <div className="display-4 text-warning fw-bold">{result.errorCount}</div>
                      <div className="text-muted">خطأ</div>
                    </div>
                  </div>
                ) : (
                  <div className="card border-success">
                    <div className="card-body text-center">
                      <div className="display-4 text-success fw-bold">0</div>
                      <div className="text-muted">خطأ</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {result.newUsers && result.newUsers.length > 0 && (
              <div className="mt-4">
                <h6>المستخدمون الجدد:</h6>
                <Alert variant="info">
                  {result.newUsers.map((user, index) => (
                    <div key={index} className="mb-2">
                      <strong>{user.username}</strong> - كلمة المرور: <code>{user.password}</code>
                    </div>
                  ))}
                  <small className="text-muted">احفظ كلمات المرور هذه بأمان</small>
                </Alert>
              </div>
            )}

            {result.errors && result.errors.length > 0 && (
              <div className="mt-4">
                <h6>تفاصيل الأخطاء:</h6>
                {result.errors.map((error, index) => (
                  <Alert key={index} variant="warning" className="py-2 small">
                    {error}
                  </Alert>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        {result && (
          <Button variant="outline-primary" onClick={handleReset} className="me-auto">
            استيراد ملف آخر
          </Button>
        )}
        <Button variant="secondary" onClick={handleCloseModal} disabled={loading}>
          إغلاق
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ImportWizard;
