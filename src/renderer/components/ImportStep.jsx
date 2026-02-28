import React, { useState } from 'react';
import { Card, Button, Form, Alert, Spinner, ListGroup } from 'react-bootstrap';
import UsersIcon from './icons/UsersIcon';
import FinancialsIcon from './icons/FinancialsIcon';
import FileExcelIcon from './icons/FileExcelIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import ExclamationCircleIcon from './icons/ExclamationCircleIcon';
import ListCheckIcon from './icons/ListCheckIcon';
import TableIcon from './icons/TableIcon';
import FolderOpenIcon from './icons/FolderOpenIcon';
import ExportsIcon from './icons/ExportsIcon'; // Reusing for upload

const StepIcon = ({ icon, className }) => {
  switch (icon) {
    case 'users':
      return <UsersIcon className={className} />;
    case 'coins':
      return <FinancialsIcon className={className} />;
    default:
      return <FileExcelIcon className={className} />;
  }
};

function ImportStep({ step, onComplete, result, disabled }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const handleFileSelect = async () => {
    try {
      const result = await window.electronAPI.openFileDialog({
        filters: [
          { name: 'Excel Files / ملفات إكسيل (*.xlsx, *.xls)', extensions: ['xlsx', 'xls'] },
          { name: 'All Files / كل الملفات (*.*)', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const fileName = filePath.split(/[\\/]/).pop();
        setSelectedFile({ path: filePath, name: fileName });
      }
    } catch (error) {
      console.error('Error selecting file:', error);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setImporting(true);
    try {
      // Use webkitRelativePath or name as fallback, but we need the full path
      const filePath = selectedFile.path || selectedFile.webkitRelativePath || selectedFile.name;
      const result = await window.electronAPI.importExcelSequential(filePath, step.id);
      onComplete(step.id, result);
    } catch (error) {
      onComplete(step.id, {
        success: false,
        message: error.message || 'حدث خطأ أثناء الاستيراد',
      });
    } finally {
      setImporting(false);
    }
  };

  const isCompleted = result?.success;
  const hasError = result && !result.success;

  return (
    <Card className={`mb-3 ${isCompleted ? 'border-success' : hasError ? 'border-danger' : ''}`}>
      <Card.Header
        className={`${isCompleted ? 'bg-success text-white' : hasError ? 'bg-danger text-white' : 'bg-light'}`}
      >
        <div className="d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center">
            <div className="me-3">
              <StepIcon
                icon={step.icon}
                className={`fa-2x ${isCompleted ? 'text-white' : hasError ? 'text-white' : 'text-primary'}`}
              />
            </div>
            <div>
              <h5 className="mb-0">{step.name}</h5>
              <small className={isCompleted || hasError ? 'text-white-50' : 'text-muted'}>
                {step.description}
              </small>
            </div>
          </div>
          <div>
            {isCompleted && <CheckCircleIcon className="fa-2x text-white" />}
            {hasError && <ExclamationCircleIcon className="fa-2x text-white" />}
          </div>
        </div>
      </Card.Header>

      <Card.Body>
        {/* Step Instructions */}
        <div className="mb-4">
          <h6 className="text-primary mb-3">
            <ListCheckIcon className="me-2" />
            الأوراق المطلوبة في هذه الخطوة:
          </h6>
          <div className="row">
            {step.sheets.map((sheet) => (
              <div key={sheet} className="col-md-6 mb-2">
                <div className="d-flex align-items-center p-2 bg-light rounded">
                  <TableIcon className="me-2 text-success" />
                  <span className="fw-medium">{sheet}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* File Selection */}
        {!isCompleted && (
          <div className="mb-3">
            <Form.Group>
              <Form.Label>اختر ملف Excel:</Form.Label>
              <div className="d-flex gap-2">
                <Button
                  variant="outline-primary"
                  onClick={handleFileSelect}
                  disabled={disabled || importing}
                >
                  <FolderOpenIcon className="me-2" />
                  اختيار ملف
                </Button>
                {selectedFile && (
                  <Form.Text className="text-muted align-self-center">
                    الملف المحدد: {selectedFile.name}
                  </Form.Text>
                )}
              </div>
            </Form.Group>
          </div>
        )}

        {/* Import Button */}
        {!isCompleted && (
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={!selectedFile || disabled || importing}
            className="me-2"
          >
            {importing ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                جاري الاستيراد...
              </>
            ) : (
              <>
                <ExportsIcon className="me-2" />
                استيراد البيانات
              </>
            )}
          </Button>
        )}

        {/* Results */}
        {result && (
          <Alert variant={result.success ? 'success' : 'danger'} className="mt-3">
            {result.success ? (
              <div>
                <strong>تم الاستيراد بنجاح!</strong>
                <div className="mt-2">
                  <div>السجلات المستوردة: {result.data?.successCount || 0}</div>
                  {result.data?.errorCount > 0 && (
                    <div className="text-warning">السجلات التي فشلت: {result.data.errorCount}</div>
                  )}
                  {result.data?.newUsers?.length > 0 && (
                    <div className="mt-2">
                      <small>تم إنشاء مستخدمين جدد بكلمات مرور مؤقتة</small>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <strong>فشل الاستيراد:</strong>
                <div className="mt-1">{result.message}</div>
                {result.data?.errors?.length > 0 && (
                  <details className="mt-2">
                    <summary>تفاصيل الأخطاء</summary>
                    <ul className="mt-2 mb-0">
                      {result.data.errors.slice(0, 5).map((error, index) => (
                        <li key={index} className="small">
                          {error}
                        </li>
                      ))}
                      {result.data.errors.length > 5 && (
                        <li className="small text-muted">
                          ... و {result.data.errors.length - 5} أخطاء أخرى
                        </li>
                      )}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </Alert>
        )}
      </Card.Body>
    </Card>
  );
}

export default ImportStep;
