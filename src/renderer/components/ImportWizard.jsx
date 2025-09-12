import React, { useState } from 'react';
import { Card, Button, Alert, Spinner } from 'react-bootstrap';
import ColumnMappingModal from './ColumnMappingModal';
import ImportResults from './ImportResults';

const ImportWizard = () => {
  const [wizardState, setWizardState] = useState('idle'); // idle, analyzing, mapping, processing, results
  const [filePath, setFilePath] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [importResults, setImportResults] = useState(null);
  const [error, setError] = useState('');

  const resetWizard = () => {
    setWizardState('idle');
    setFilePath(null);
    setAnalysis(null);
    setImportResults(null);
    setError('');
  };

  const handleFileSelect = async () => {
    setError('');
    setWizardState('analyzing');
    const selectedPath = await window.electronAPI.openImportFileDialog();
    if (selectedPath) {
      setFilePath(selectedPath);
      const result = await window.electronAPI.analyzeImportFile(selectedPath);
      if (result.success) {
        if (Object.keys(result.analysis.sheets).length === 0) {
          setError('No sheets with recognized names found in the Excel file. Please use the template or name your sheets according to the import type (e.g., "الطلاب", "المعلمون").');
          setWizardState('idle');
        } else {
          setAnalysis(result.analysis);
          setWizardState('mapping');
        }
      } else {
        setError(result.message);
        setWizardState('idle');
      }
    } else {
      setWizardState('idle'); // User canceled file dialog
    }
  };

  const handleMappingConfirm = async (confirmedMappings) => {
    setWizardState('processing');
    const result = await window.electronAPI.processImport({ filePath, confirmedMappings });
    if (result.success) {
      setImportResults(result.results);
      setWizardState('results');
    } else {
      setError(result.message);
      setWizardState('mapping'); // Go back to mapping if processing fails
    }
  };

  const handleMappingCancel = () => {
    setWizardState('idle');
    setAnalysis(null);
    setFilePath(null);
  };

  return (
    <Card className="mt-3">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center">
          <Card.Title>استيراد مرن للبيانات</Card.Title>
          {wizardState !== 'idle' && (
            <Button variant="secondary" size="sm" onClick={resetWizard}>
              بدء من جديد
            </Button>
          )}
        </div>
        <p>استورد البيانات من ملف Excel. سيقوم المعالج بإرشادك خلال العملية.</p>

        {error && <Alert variant="danger">{error}</Alert>}

        {wizardState === 'idle' && (
          <div className="text-center">
            <Button variant="primary" size="lg" onClick={handleFileSelect}>
              1. اختر ملف Excel
            </Button>
          </div>
        )}

        {wizardState === 'analyzing' && (
          <div className="text-center">
            <Spinner animation="border" role="status" />
            <p className="mt-2">جاري تحليل الملف...</p>
          </div>
        )}

        {wizardState === 'processing' && (
          <div className="text-center">
            <Spinner animation="border" role="status" />
            <p className="mt-2">جاري معالجة الاستيراد...</p>
          </div>
        )}

        {wizardState === 'results' && <ImportResults results={importResults} />}

        <ColumnMappingModal
          show={wizardState === 'mapping'}
          analysis={analysis}
          onConfirm={handleMappingConfirm}
          onCancel={handleMappingCancel}
        />
      </Card.Body>
    </Card>
  );
};

export default ImportWizard;
