import React, { useState } from 'react';
import { Modal, Button, ProgressBar, Form, Table, Spinner, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';

const steps = ['رفع الملف', 'مطابقة الأعمدة', 'مراجعة واستيراد', 'اكتمل'];

const ImportWizardModal = ({ show, onHide, entity }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mappings, setMappings] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const entityFields = {
    students: [
      { key: 'name', label: 'الاسم الكامل', required: true },
      { key: 'matricule', label: 'الرقم التسلسلي', required: true },
      { key: 'gender', label: 'الجنس' },
      { key: 'date_of_birth', label: 'تاريخ الميلاد' },
      { key: 'class_id', label: 'معرف الصف' },
    ],
    teachers: [
      { key: 'name', label: 'الاسم الكامل', required: true },
      { key: 'matricule', label: 'الرقم التسلسلي', required: true },
      { key: 'email', label: 'البريد الإلكتروني' },
      { key: 'phone_number', label: 'رقم الهاتف' },
    ],
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setIsLoading(true);
      try {
        const result = await window.electronAPI.analyzeImportFile({ filePath: selectedFile.path });
        setHeaders(result.headers);
        setRows(result.rows);
        const initialMappings = {};
        const availableFields = entityFields[entity];
        result.headers.forEach(header => {
          const matchingField = availableFields.find(f => f.label === header || f.key === header);
          if (matchingField) {
            initialMappings[header] = matchingField.key;
          }
        });
        setMappings(initialMappings);
        handleNext();
      } catch (error) {
        toast.error(`خطأ في تحليل الملف: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleMappingChange = (header, fieldKey) => {
    setMappings(prev => ({ ...prev, [header]: fieldKey }));
  };

  const handleNext = () => setActiveStep((prev) => prev + 1);
  const handleBack = () => setActiveStep((prev) => prev - 1);
  const handleReset = () => {
    setActiveStep(0);
    setFile(null);
    setHeaders([]);
    setRows([]);
    setMappings({});
    setImportResult(null);
    onHide();
  };

  const handleImport = async (dryRun) => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.executeImport({
        entity,
        filePath: file.path,
        mappings,
        dryRun,
      });
      setImportResult(result);
      if (!dryRun) {
        toast.success(`تم الاستيراد بنجاح! ${result.added} سجلات جديدة, ${result.updated} سجلات محدثة.`);
        handleNext();
      } else {
        toast.info(`المراجعة جاهزة. ${result.added} سجلات جديدة, ${result.updated} سجلات محدثة.`);
      }
    } catch (error) {
      toast.error(`فشل الاستيراد: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <div className="text-center p-3">
            <h6 className="mb-3">اختر ملف Excel أو CSV للاستيراد</h6>
            <Button variant="primary" as="label" htmlFor="fileUpload">
              اختر ملف
            </Button>
            <input id="fileUpload" type="file" style={{ display: 'none' }} accept=".csv, .xlsx" onChange={handleFileChange} />
            {isLoading && <Spinner animation="border" className="mt-2" />}
          </div>
        );
      case 1:
        return (
          <div className="p-2">
            <h6>مطابقة أعمدة الملف مع حقول النظام</h6>
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>عمود من الملف</th>
                  <th>حقل في النظام</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header) => (
                  <tr key={header}>
                    <td>{header}</td>
                    <td>
                      <Form.Select
                        value={mappings[header] || ''}
                        onChange={(e) => handleMappingChange(header, e.target.value)}
                      >
                        <option value=""><em>تجاهل</em></option>
                        {entityFields[entity].map(field => (
                          <option key={field.key} value={field.key}>
                            {field.label} {field.required && '*'}
                          </option>
                        ))}
                      </Form.Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        );
      case 2:
        return (
          <div className="p-2 text-center">
            <h6>مراجعة البيانات</h6>
            {!importResult ? (
              <Button variant="primary" onClick={() => handleImport(true)} disabled={isLoading}>
                {isLoading ? <Spinner as="span" animation="border" size="sm" /> : 'بدء المراجعة'}
              </Button>
            ) : (
              <div>
                <p>سيتم إضافة: {importResult.added} سجل</p>
                <p>سيتم تحديث: {importResult.updated} سجل</p>
                <p>أخطاء: {importResult.errors.length}</p>
                {importResult.errors.length > 0 && (
                  <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid red', padding: '8px', marginTop: '8px' }}>
                    {importResult.errors.map((err, i) => <p key={i} className="text-danger">{err}</p>)}
                  </div>
                )}
                <Button className="mt-2" variant="success" onClick={() => handleImport(false)} disabled={isLoading || importResult.errors.length > 0}>
                  {isLoading ? <Spinner as="span" animation="border" size="sm" /> : 'تأكيد الاستيراد'}
                </Button>
              </div>
            )}
          </div>
        );
      case 3:
        return (
          <div className="text-center p-3">
            <h5 className="text-success">اكتمل الاستيراد!</h5>
            <p>تم إضافة: {importResult.added} سجل</p>
            <p>تم تحديث: {importResult.updated} سجل</p>
            <Button className="mt-3" variant="primary" onClick={handleReset}>إغلاق</Button>
          </div>
        );
      default:
        return 'خطوة غير معروفة';
    }
  };

  const progressPercent = Math.round((activeStep / (steps.length - 1)) * 100);

  return (
    <Modal show={show} onHide={handleReset} size="lg" centered backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>معالج الاستيراد: {steps[activeStep]}</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ minHeight: '400px' }}>
        <ProgressBar now={progressPercent} label={`${steps[activeStep]}`} className="mb-4" />
        {renderStepContent(activeStep)}
      </Modal.Body>
      {activeStep < 3 && (
        <Modal.Footer>
          <Button variant="secondary" disabled={activeStep === 0 || isLoading} onClick={handleBack}>
            رجوع
          </Button>
          {activeStep === 1 && (
            <Button variant="primary" onClick={handleNext}>
              التالي
            </Button>
          )}
        </Modal.Footer>
      )}
    </Modal>
  );
};

export default ImportWizardModal;
