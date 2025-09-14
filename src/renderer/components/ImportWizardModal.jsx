import React, { useState } from 'react';
import { Modal, Button, Stepper, Step, StepLabel, Box, CircularProgress, Typography, Table, TableHead, TableRow, TableCell, TableBody, Select, MenuItem, FormControl, InputLabel } from '@mui/material'; // Assuming Material-UI for Stepper
import { toast } from 'react-toastify';

const steps = ['رفع الملف', 'مطابقة الأعمدة', 'مراجعة واستيراد'];

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
        const result = await window.electron.ipcRenderer.invoke('import:analyze', { filePath: selectedFile.path });
        setHeaders(result.headers);
        setRows(result.rows);
        // Auto-map based on header name similarity
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
      const result = await window.electron.ipcRenderer.invoke('import:execute', {
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
          <Box sx={{ textAlign: 'center', p: 3 }}>
            <Typography variant="h6" gutterBottom>
              اختر ملف Excel أو CSV للاستيراد
            </Typography>
            <Button variant="contained" component="label">
              اختر ملف
              <input type="file" hidden accept=".csv, .xlsx" onChange={handleFileChange} />
            </Button>
            {isLoading && <CircularProgress sx={{ mt: 2 }} />}
          </Box>
        );
      case 1:
        return (
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>مطابقة أعمدة الملف مع حقول النظام</Typography>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>عمود من الملف</TableCell>
                  <TableCell>حقل في النظام</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {headers.map((header) => (
                  <TableRow key={header}>
                    <TableCell>{header}</TableCell>
                    <TableCell>
                      <FormControl fullWidth>
                        <InputLabel>اختر حقلاً</InputLabel>
                        <Select
                          value={mappings[header] || ''}
                          onChange={(e) => handleMappingChange(header, e.target.value)}
                        >
                          <MenuItem value=""><em>تجاهل</em></MenuItem>
                          {entityFields[entity].map(field => (
                            <MenuItem key={field.key} value={field.key}>
                              {field.label} {field.required && '*'}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        );
      case 2:
        return (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom>مراجعة البيانات</Typography>
            {!importResult ? (
              <Button variant="contained" onClick={() => handleImport(true)} disabled={isLoading}>
                {isLoading ? <CircularProgress size={24} /> : 'بدء المراجعة'}
              </Button>
            ) : (
              <Box>
                <Typography>سيتم إضافة: {importResult.added} سجل</Typography>
                <Typography>سيتم تحديث: {importResult.updated} سجل</Typography>
                <Typography>أخطاء: {importResult.errors.length}</Typography>
                {importResult.errors.length > 0 && (
                  <Box sx={{ maxHeight: 200, overflow: 'auto', mt: 2, border: '1px solid red', p: 1 }}>
                    {importResult.errors.map((err, i) => <Typography key={i} color="error">{err}</Typography>)}
                  </Box>
                )}
                <Button sx={{ mt: 2 }} variant="contained" color="success" onClick={() => handleImport(false)} disabled={isLoading || importResult.errors.length > 0}>
                  {isLoading ? <CircularProgress size={24} /> : 'تأكيد الاستيراد'}
                </Button>
              </Box>
            )}
          </Box>
        );
      case 3:
        return (
          <Box sx={{ textAlign: 'center', p: 3 }}>
            <Typography variant="h5" color="success.main">اكتمل الاستيراد!</Typography>
            <Typography>تم إضافة: {importResult.added} سجل</Typography>
            <Typography>تم تحديث: {importResult.updated} سجل</Typography>
            <Button sx={{ mt: 3 }} variant="contained" onClick={handleReset}>إغلاق</Button>
          </Box>
        );
      default:
        return 'خطوة غير معروفة';
    }
  };

  return (
    <Modal open={show} onClose={handleReset}>
      <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 800, bgcolor: 'background.paper', boxShadow: 24, p: 4 }}>
        <Stepper activeStep={activeStep}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        <Box sx={{ mt: 2, mb: 1, minHeight: 400 }}>
          {renderStepContent(activeStep)}
        </Box>
        {activeStep < 3 && (
          <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
            <Button disabled={activeStep === 0 || isLoading} onClick={handleBack}>
              رجوع
            </Button>
            <Box sx={{ flex: '1 1 auto' }} />
            {activeStep === 1 && (
              <Button onClick={handleNext}>
                التالي
              </Button>
            )}
          </Box>
        )}
      </Box>
    </Modal>
  );
};

export default ImportWizardModal;
