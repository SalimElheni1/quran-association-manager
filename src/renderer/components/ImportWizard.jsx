import React, { useState, useEffect } from 'react';
import { Card, Button, Alert, Spinner } from 'react-bootstrap';
import ColumnMappingModal from './ColumnMappingModal';
import ImportResults from './ImportResults';
import SheetReviewStep from './SheetReviewStep';
import TemplateDownloadModal from './TemplateDownloadModal';

const ImportWizard = () => {
  const [wizardState, setWizardState] = useState('idle'); // idle, analyzing, reviewing, mapping, processing, results
  const [filePath, setFilePath] = useState(null);
  const [analysis, setAnalysis] = useState(null); // This will hold the original analysis
  const [reviewedMappings, setReviewedMappings] = useState(null); // This will hold the user-confirmed types
  const [importResults, setImportResults] = useState(null);
  const [error, setError] = useState('');
  const [columnMappings, setColumnMappings] = useState(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  useEffect(() => {
    window.electronAPI.getColumnMappings().then(setColumnMappings);
  }, []);

  const resetWizard = () => {
    setWizardState('idle');
    setFilePath(null);
    setAnalysis(null);
    setReviewedMappings(null);
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
          setError('لم يتم العثور على أي أوراق في ملف Excel.');
          setWizardState('idle');
        } else {
          setAnalysis(result.analysis);
          setWizardState('reviewing');
        }
      } else {
        setError(result.message);
        setWizardState('idle');
      }
    } else {
      setWizardState('idle'); // User canceled file dialog
    }
  };

  const handleReviewConfirm = (confirmedSheetTypes) => {
    // confirmedSheetTypes is an object where keys are sheet names and values are { type, mapping, ... }
    // We need to construct an object that the ColumnMappingModal can use.
    const analysisForMapping = { sheets: {} };
    for (const sheetName in confirmedSheetTypes) {
      const { type, mapping, headers, warnings, rowCount, dataStartRowIndex } =
        confirmedSheetTypes[sheetName];
      analysisForMapping.sheets[sheetName] = {
        detectedType: type,
        suggestedMapping: mapping,
        headers,
        warnings,
        rowCount,
        dataStartRowIndex,
      };
    }
    setReviewedMappings(confirmedSheetTypes);
    setAnalysis(analysisForMapping); // Overwrite analysis with the reviewed data for the mapping modal
    setWizardState('mapping');
  };

  const handleMappingConfirm = async (finalMappings) => {
    // `finalMappings` is the object from ColumnMappingModal, e.g., { "Sheet1": { "name": 1, "email": 2 } }
    // We need to combine this with the `type` from `reviewedMappings`.
    const mappingsForBackend = {};
    for (const sheetName in finalMappings) {
      if (reviewedMappings[sheetName]) {
        mappingsForBackend[sheetName] = {
          type: reviewedMappings[sheetName].type,
          mapping: finalMappings[sheetName],
          dataStartRowIndex: reviewedMappings[sheetName].dataStartRowIndex,
        };
      }
    }

    setWizardState('processing');
    const result = await window.electronAPI.processImport({
      filePath,
      confirmedMappings: mappingsForBackend,
    });
    if (result.success) {
      setImportResults(result.results);
      setWizardState('results');
    } else {
      setError(result.message);
      setWizardState('mapping'); // Go back to mapping if processing fails
    }
  };

  const handleCancel = () => {
    resetWizard();
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
            <p className="mb-3">
              يمكنك تحميل قالب جاهز لضمان توافق ملفك مع النظام، أو يمكنك رفع ملفك مباشرة.
            </p>
            <Button
              variant="outline-secondary"
              size="lg"
              onClick={() => setShowTemplateModal(true)}
              className="me-3"
            >
              تحميل قالب
            </Button>
            <Button variant="primary" size="lg" onClick={handleFileSelect}>
              رفع ملف Excel
            </Button>
          </div>
        )}

        {wizardState === 'analyzing' && (
          <div className="text-center">
            <Spinner animation="border" role="status" />
            <p className="mt-2">جاري تحليل الملف...</p>
          </div>
        )}

        {wizardState === 'reviewing' && (
          <SheetReviewStep
            analysis={analysis}
            columnMappings={columnMappings}
            onConfirm={handleReviewConfirm}
            onCancel={handleCancel}
          />
        )}

        {wizardState === 'processing' && (
          <div className="text-center">
            <Spinner animation="border" role="status" />
            <p className="mt-2">جاري معالجة الاستيراد...</p>
          </div>
        )}

        {wizardState === 'results' && <ImportResults results={importResults} />}

        {wizardState === 'mapping' && (
          <ColumnMappingModal
            show={wizardState === 'mapping'}
            analysis={analysis} // This is now the reviewed analysis
            onConfirm={handleMappingConfirm}
            onCancel={handleCancel}
          />
        )}

        <TemplateDownloadModal
          show={showTemplateModal}
          onHide={() => setShowTemplateModal(false)}
          columnMappings={columnMappings}
        />
      </Card.Body>
    </Card>
  );
};

export default ImportWizard;
