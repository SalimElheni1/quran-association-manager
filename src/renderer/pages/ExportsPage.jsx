import React, { useState, useEffect, useMemo } from 'react';
import { error as logError } from '@renderer/utils/logger';
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Alert,
  Nav,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap';
import ImportWizard from '@renderer/components/ImportWizard';
import '@renderer/styles/ExportsPage.css';

const ExportTabPanel = ({ exportType, fields, kidFields = [], isAttendance = false }) => {
  const [genderFilter, setGenderFilter] = useState('all');
  const [filterMode, setFilterMode] = useState('gender'); // 'gender' or 'group'
  const [selectedFields, setSelectedFields] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('all');
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('all');

  const currentFields = useMemo(() => {
    if (exportType === 'students' && genderFilter === 'kids') {
      return kidFields;
    }
    return fields;
  }, [exportType, genderFilter, fields, kidFields]);

  useEffect(() => {
    // When the available fields change (e.g., from adult to kid), reset the selected fields to all be checked by default.
    setSelectedFields(currentFields.map((f) => f.key));
  }, [currentFields]);

  useEffect(() => {
    if (isAttendance) {
      window.electronAPI
        .getClasses()
        .then(setClasses)
        .catch((err) => {
          logError('Failed to fetch classes for export:', err);
          setMessage({ type: 'danger', text: 'فشل تحميل قائمة الفصول.' });
        });
    }
    // fetch groups for students exports
    if (exportType === 'students') {
      window.electronAPI
        .getGroups()
        .then((res) => {
          if (res && res.success && Array.isArray(res.data)) setGroups(res.data);
        })
        .catch((err) => {
          logError('Failed to fetch groups for export:', err);
        });
    }
  }, [isAttendance]);

  const handleCheckboxChange = (event) => {
    const { value, checked } = event.target;
    if (checked) {
      setSelectedFields([...selectedFields, value]);
    } else {
      setSelectedFields(selectedFields.filter((field) => field !== value));
    }
  };

  const handleExport = async (format) => {
    setMessage({ type: '', text: '' });

    if (selectedFields.length === 0) {
      setMessage({ type: 'danger', text: 'الرجاء تحديد حقل واحد على الأقل للتصدير.' });
      return;
    }

    const columns = selectedFields.map((key) => {
      const field = currentFields.find((f) => f.key === key);
      return { header: field.label, key: field.key };
    });

    const exportOptions = {
      exportType,
      format,
      columns,
      options: {},
    };

    if (isAttendance) {
      if (!startDate || !endDate) {
        setMessage({ type: 'danger', text: 'الرجاء تحديد تاريخ بدء ونهاية صالحين.' });
        return;
      }
      exportOptions.options.startDate = startDate;
      exportOptions.options.endDate = endDate;
      exportOptions.options.classId = selectedClassId;
    } else {
      if (filterMode === 'group' && exportType === 'students') {
        exportOptions.options.groupId = selectedGroupId === 'all' ? null : selectedGroupId;
      } else {
        exportOptions.options.gender = genderFilter;
      }
    }

    try {
      const result = await window.electronAPI.generateExport(exportOptions);

      if (result.success) {
        setMessage({ type: 'success', text: `تم تصدير الملف بنجاح!` });
      } else {
        // Check for specific, user-fixable errors
        if (result.message.includes('TEMPLATE_NOT_FOUND')) {
          setMessage({
            type: 'warning',
            text: 'فشل تصدير DOCX: ملف القالب "export_template_v2.docx" غير موجود. يرجى إنشائه في المجلد الصحيح.',
          });
        } else if (result.message.includes('TEMPLATE_INVALID')) {
          setMessage({
            type: 'warning',
            text: 'فشل تصدير DOCX: ملف القالب تالف أو فارغ. يرجى التأكد من أنه ملف Word صالح.',
          });
        } else {
          setMessage({ type: 'danger', text: `فشل التصدير: ${result.message}` });
        }
      }
    } catch (error) {
      setMessage({ type: 'danger', text: `حدث خطأ: ${error.message}` });
      logError('Export failed:', error);
    }
  };

  const isExportDisabled = selectedFields.length === 0;
  const showLandscapeWarning = selectedFields.length > 4;

  return (
    <Card className="mt-3">
      <Card.Body>
        <Card.Title>
          تصدير{' '}
          {exportType === 'students'
            ? 'بيانات الطلاب'
            : exportType === 'teachers'
              ? 'بيانات المعلمين'
              : exportType === 'admins'
                ? 'بيانات المستخدمين'
                : 'سجل الحضور'}
        </Card.Title>
        <p>اختر الحقول التي تريد تضمينها في التصدير.</p>
        <Form>
          {!isAttendance && (
            <Row className="mb-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label>مرشح التصدير</Form.Label>
                  <Form.Select value={filterMode} onChange={(e) => setFilterMode(e.target.value)}>
                    <option value="gender">حسب الجنس</option>
                    {exportType === 'students' && <option value="group">حسب المجموعة</option>}
                  </Form.Select>
                </Form.Group>
              </Col>

              {filterMode === 'gender' && (
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>فرز حسب الجنس</Form.Label>
                    <Form.Select
                      value={genderFilter}
                      onChange={(e) => setGenderFilter(e.target.value)}
                    >
                      <option value="all">الكل</option>
                      <option value="men">رجال</option>
                      <option value="women">نساء</option>
                      {exportType === 'students' && <option value="kids">أطفال</option>}
                    </Form.Select>
                  </Form.Group>
                </Col>
              )}

              {filterMode === 'group' && exportType === 'students' && (
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>اختر المجموعة</Form.Label>
                    <Form.Select
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                    >
                      <option value="all">كل المجموعات</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              )}
            </Row>
          )}
          {isAttendance && (
            <Row className="mb-3">
              <Col md={4}>
                <Form.Group>
                  <Form.Label>اختر الفصل</Form.Label>
                  <Form.Select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                  >
                    <option value="all">كل الفصول</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>من تاريخ</Form.Label>
                  <Form.Control
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>إلى تاريخ</Form.Label>
                  <Form.Control
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </Form.Group>
              </Col>
            </Row>
          )}
          <Row>
            {currentFields.map((field) => (
              <Col md={4} key={field.key} className="mb-2">
                <Form.Check
                  type="checkbox"
                  id={`${exportType}-${field.key}`}
                  label={field.label}
                  value={field.key}
                  checked={selectedFields.includes(field.key)}
                  onChange={handleCheckboxChange}
                />
              </Col>
            ))}
          </Row>

          <hr />

          {showLandscapeWarning && !isAttendance && (
            <Alert variant="info">
              ملاحظة: سيتم إنشاء التقرير بالوضع الأفقي لاستيعاب عدد الأعمدة المحدد.
            </Alert>
          )}

          {message.text && <Alert variant={message.type}>{message.text}</Alert>}

          <div className="d-flex justify-content-end gap-2">
            <Button
              variant="secondary"
              onClick={() => handleExport('docx')}
              disabled={isExportDisabled}
            >
              تصدير إلى DOCX
            </Button>
            <Button variant="primary" onClick={() => handleExport('xlsx')}>
              تصدير إلى Excel
            </Button>
            <Button
              variant="danger"
              onClick={() => handleExport('pdf')}
              disabled={isExportDisabled}
            >
              تصدير إلى PDF
            </Button>
          </div>
        </Form>
      </Card.Body>
    </Card>
  );
};

const studentsAdultFields = [
  { key: 'matricule', label: 'الرقم التعريفي' },
  { key: 'name', label: 'الاسم واللقب' },
  { key: 'national_id', label: 'رقم ب.ت.و' },
  { key: 'date_of_birth', label: 'تاريخ الميلاد' },
  { key: 'gender', label: 'الجنس' },
  { key: 'address', label: 'العنوان' },
  { key: 'contact_info', label: 'رقم الهاتف' },
  { key: 'email', label: 'البريد الإلكتروني' },
  { key: 'enrollment_date', label: 'تاريخ التسجيل' },
  { key: 'status', label: 'الحالة' },
  { key: 'memorization_level', label: 'مستوى الحفظ' },
  { key: 'notes', label: 'ملاحظات' },
];

const studentsKidsFields = [
  { key: 'matricule', label: 'الرقم التعريفي' },
  { key: 'name', label: 'الاسم واللقب' },
  { key: 'date_of_birth', label: 'تاريخ الميلاد' },
  { key: 'gender', label: 'الجنس' },
  { key: 'address', label: 'العنوان' },
  { key: 'contact_info', label: 'رقم الهاتف' },
  { key: 'email', label: 'البريد الإلكتروني' },
  { key: 'enrollment_date', label: 'تاريخ التسجيل' },
  { key: 'status', label: 'الحالة' },
  { key: 'memorization_level', label: 'مستوى الحفظ' },
  { key: 'notes', label: 'ملاحظات' },
  { key: 'parent_name', label: 'اسم ولي الأمر' },
  { key: 'parent_contact', label: 'هاتف ولي الأمر' },
];

const arabicFieldDefinitions = {
  students: studentsAdultFields, // Default to adult fields
  studentsKids: studentsKidsFields,
  teachers: [
    { key: 'matricule', label: 'الرقم التعريفي' },
    { key: 'name', label: 'الاسم واللقب' },
    { key: 'national_id', label: 'رقم ب.ت.و' },
    { key: 'contact_info', label: 'رقم الهاتف' },
    { key: 'email', label: 'البريد الإلكتروني' },
    { key: 'specialization', label: 'التخصص' },
    { key: 'years_of_experience', label: 'سنوات الخبرة' },
  ],
  admins: [
    { key: 'matricule', label: 'الرقم التعريفي' },
    { key: 'username', label: 'اسم المستخدم' },
    { key: 'first_name', label: 'الاسم الأول' },
    { key: 'last_name', label: 'اللقب' },
    { key: 'email', label: 'البريد الإلكتروني' },
    { key: 'role', label: 'الدور' },
    { key: 'status', label: 'الحالة' },
  ],
  attendance: [
    { key: 'student_name', label: 'اسم الطالب' },
    { key: 'class_name', label: 'اسم الفصل' },
    { key: 'date', label: 'التاريخ' },
    { key: 'status', label: 'الحالة' },
  ],
};

const ImportTabPanel = () => {
  const [message, setMessage] = useState({ type: '', text: '' });
  const [importResults, setImportResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Simplified sheets - only basic data
  const allSheets = [
    'الطلاب',
    'المعلمون',
    'المستخدمون',
    'المجموعات',
    'المخزون',
    'التبرعات',
    'المصاريف'
  ];
  const [selectedSheets, setSelectedSheets] = useState(allSheets);

  const handleSheetCheckboxChange = (sheetName) => {
    setSelectedSheets((prev) =>
      prev.includes(sheetName) ? prev.filter((s) => s !== sheetName) : [...prev, sheetName],
    );
  };

  const handleSelectAllSheets = (select) => {
    if (select) {
      setSelectedSheets(allSheets);
    } else {
      setSelectedSheets([]);
    }
  };

  const handleGenerateTemplate = async () => {
    setIsLoading(true);
    setMessage({ type: '', text: '' });
    setImportResults(null);
    try {
      const result = await window.electronAPI.generateImportTemplate();
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

  const handleGenerateDevTemplate = async () => {
    setIsLoading(true);
    setMessage({ type: '', text: '' });
    setImportResults(null);
    try {
      const result = await window.electronAPI.generateDevTemplate();
      if (result.success) {
        setMessage({ type: 'success', text: 'تم إنشاء قالب التطوير بنجاح!' });
      } else {
        setMessage({ type: 'danger', text: `فشل إنشاء القالب: ${result.message}` });
      }
    } catch (error) {
      setMessage({ type: 'danger', text: `حدث خطأ: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (selectedSheets.length === 0) {
      setMessage({ type: 'danger', text: 'الرجاء تحديد ورقة واحدة على الأقل للاستيراد.' });
      return;
    }
    setIsLoading(true);
    setMessage({ type: '', text: '' });
    setImportResults(null);
    try {
      const result = await window.electronAPI.executeImport({ selectedSheets });
      if (result.success) {
        setImportResults(result);
        if (result.errorCount === 0) {
          setMessage({ type: 'success', text: 'تم الاستيراد بنجاح!' });
        } else {
          setMessage({ type: 'warning', text: 'اكتمل الاستيراد مع وجود أخطاء.' });
        }
      } else {
        setMessage({ type: 'danger', text: `فشل الاستيراد: ${result.message}` });
      }
    } catch (error) {
      setMessage({ type: 'danger', text: `حدث خطأ: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mt-3">
      <Card.Body>
        <Card.Title>استيراد بيانات من ملف Excel</Card.Title>
        <p>
          قم بإنشاء قالب Excel، واملأه بالبيانات، ثم قم باستيراده لإضافة سجلات متعددة دفعة واحدة.
        </p>



        {/* Template Generation */}
        <div className="mb-4">
          <div className="text-center">
            <Button 
              variant="success" 
              size="lg"
              onClick={handleGenerateTemplate}
              disabled={isLoading}
              className="px-4"
            >
              <i className="fas fa-file-excel me-2"></i>
              إنشاء قالب Excel
            </Button>
            <p className="text-muted small mt-2 mb-0">
              قم بإنشاء قالب Excel فارغ يحتوي على جميع الأوراق والأعمدة المطلوبة
            </p>
          </div>
        </div>

        <hr className="my-4" />

        {/* Sheet Selection Interface */}
        <div className="mb-4">
          <h5 className="mb-3">
            <i className="fas fa-check-square me-2 text-primary"></i>
            اختر البيانات المراد استيرادها:
          </h5>
          
          <div className="row mb-4">
            {/* Basic Data Category */}
            <div className="col-md-6 mb-3">
              <div className="card h-100">
                <div className="card-header bg-primary text-white">
                  <h6 className="mb-0">
                    <i className="fas fa-users me-2"></i>
                    البيانات الأساسية
                  </h6>
                </div>
                <div className="card-body">
                  {['الطلاب', 'المعلمون', 'المستخدمون', 'المجموعات', 'المخزون'].map(sheet => (
                    <Form.Check
                      key={sheet}
                      type="checkbox"
                      id={`sheet-${sheet}`}
                      label={sheet}
                      checked={selectedSheets.includes(sheet)}
                      onChange={() => handleSheetCheckboxChange(sheet)}
                      className="mb-2"
                    />
                  ))}
                </div>
              </div>
            </div>
            
            {/* Financial Data Category */}
            <div className="col-md-6 mb-3">
              <div className="card h-100">
                <div className="card-header bg-success text-white">
                  <h6 className="mb-0">
                    <i className="fas fa-coins me-2"></i>
                    البيانات المالية
                  </h6>
                </div>
                <div className="card-body">
                  {['التبرعات', 'المصاريف'].map(sheet => (
                    <Form.Check
                      key={sheet}
                      type="checkbox"
                      id={`sheet-${sheet}`}
                      label={sheet}
                      checked={selectedSheets.includes(sheet)}
                      onChange={() => handleSheetCheckboxChange(sheet)}
                      className="mb-2"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* Selection Summary & Actions */}
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <span className="text-muted">
                تم تحديد {selectedSheets.length} من {allSheets.length} أوراق
              </span>
            </div>
            <div>
              <Button 
                variant="outline-primary" 
                size="sm" 
                onClick={() => {
                  const allSelected = selectedSheets.length === allSheets.length;
                  handleSelectAllSheets(!allSelected);
                }}
              >
                <i className={`fas ${selectedSheets.length === allSheets.length ? 'fa-times' : 'fa-check'} me-1`}></i>
                {selectedSheets.length === allSheets.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
              </Button>
            </div>
          </div>
          
          {/* Start Wizard Button */}
          <div className="text-center">
            <Button 
              variant="primary" 
              size="lg"
              onClick={() => setShowWizard(true)}
              disabled={isLoading || selectedSheets.length === 0}
              className="px-5"
            >
              <i className="fas fa-magic me-2"></i>
              بدء معالج الاستيراد
              {selectedSheets.length > 0 && (
                <span className="badge bg-light text-primary ms-2">
                  {selectedSheets.length}
                </span>
              )}
            </Button>
          </div>
          
          {selectedSheets.length === 0 && (
            <Alert variant="warning" className="mt-3 text-center">
              <i className="fas fa-exclamation-triangle me-2"></i>
              الرجاء تحديد ورقة واحدة على الأقل لبدء الاستيراد
            </Alert>
          )}
        </div>

        {showAdvanced && (
          <>
            <div className="d-flex justify-content-start gap-2 mb-3">
              <Button variant="primary" onClick={handleGenerateTemplate} disabled={isLoading}>
                {isLoading ? 'جاري الإنشاء...' : '1. إنشاء قالب Excel'}
              </Button>
              <Button variant="success" onClick={handleImport} disabled={isLoading}>
                {isLoading ? 'جاري الاستيراد...' : '2. استيراد ملف Excel'}
              </Button>
            </div>
          </>
        )}

        {showAdvanced && message.text && <Alert variant={message.type}>{message.text}</Alert>}

        {showAdvanced && importResults && (
          <div className="mt-4">
            <h4>نتائج الاستيراد:</h4>
            <p>
              <strong>تم بنجاح:</strong> {importResults.successCount} سجلات
            </p>
            <p>
              <strong>فشل:</strong> {importResults.errorCount} سجلات
            </p>
            {importResults.newUsers?.length > 0 && (
              <div>
                <h5>المستخدمون الجدد الذين تم إنشاؤهم (يرجى حفظ كلمات المرور هذه بأمان):</h5>
                <ul>
                  {importResults.newUsers.map((user, index) => (
                    <li key={index}>
                      <strong>{user.username}:</strong> {user.password}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {importResults.errors?.length > 0 && (
              <div>
                <h5>تفاصيل الخطأ:</h5>
                <ul className="error-list">
                  {importResults.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        
        <ImportWizard 
          show={showWizard} 
          handleClose={() => setShowWizard(false)}
          selectedSheets={selectedSheets}
        />
      </Card.Body>
    </Card>
  );
};

const ARABIC_MONTHS = [
  'جانفي',
  'فيفري',
  'مارس',
  'أفريل',
  'ماي',
  'جوان',
  'جويلية',
  'أوت',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const renderYearOptions = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = currentYear; i >= currentYear - 10; i--) {
    years.push(
      <option key={i} value={i}>
        {i}
      </option>,
    );
  }
  return years;
};

const ExportsPage = () => {
  const [activeTab, setActiveTab] = useState('students');
  const [message, setMessage] = useState({ type: '', text: '' });

  // State for financial export filters
  const [filterType, setFilterType] = useState('all'); // 'all', 'month', 'year', 'custom'
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const handleFinancialExport = async () => {
    setMessage({ type: '', text: '' });

    let period = null;

    if (filterType === 'month') {
      const startDate =
        new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0] + ' 00:00:00';
      const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59).toISOString();
      period = { startDate, endDate };
    } else if (filterType === 'year') {
      const startDate = new Date(selectedYear, 0, 1).toISOString().split('T')[0] + ' 00:00:00';
      const endDate = new Date(selectedYear, 11, 31, 23, 59, 59).toISOString();
      period = { startDate, endDate };
    } else if (filterType === 'custom') {
      if (customStartDate && customEndDate) {
        period = { startDate: customStartDate, endDate: customEndDate };
      } else {
        setMessage({
          type: 'danger',
          text: 'الرجاء تحديد تاريخ بدء وانتهاء صالحين للفترة المخصصة.',
        });
        return;
      }
    }
    // For 'all', period remains null

    const exportOptions = {
      exportType: 'financial-report',
      format: 'xlsx',
      options: { period },
    };

    try {
      const result = await window.electronAPI.generateExport(exportOptions);
      if (result.success) {
        setMessage({ type: 'success', text: `تم تصدير الملف بنجاح!` });
      } else {
        setMessage({ type: 'danger', text: `فشل التصدير: ${result.message}` });
      }
    } catch (error) {
      setMessage({ type: 'danger', text: `حدث خطأ: ${error.message}` });
      logError('Export failed:', error);
    }
  };

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'import':
        return <ImportTabPanel />;
      case 'students':
        return (
          <ExportTabPanel
            exportType="students"
            fields={arabicFieldDefinitions.students}
            kidFields={arabicFieldDefinitions.studentsKids}
          />
        );
      case 'teachers':
        return <ExportTabPanel exportType="teachers" fields={arabicFieldDefinitions.teachers} />;
      case 'admins':
        return <ExportTabPanel exportType="admins" fields={arabicFieldDefinitions.admins} />;
      case 'attendance':
        return (
          <ExportTabPanel
            exportType="attendance"
            fields={arabicFieldDefinitions.attendance}
            isAttendance={true}
          />
        );
      case 'financials':
        return (
          <Card className="mt-3">
            <Card.Body>
              <Card.Title>تصدير تقرير مالي شامل</Card.Title>
              <p>
                اختر فترة التصدير. يمكنك تصدير جميع البيانات، أو تحديد شهر معين، سنة معينة، أو فترة
                مخصصة.
              </p>
              <Form>
                <Row className="mb-3 align-items-end">
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label>نوع الفترة</Form.Label>
                      <Form.Select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                      >
                        <option value="all">الكل</option>
                        <option value="month">شهر معين</option>
                        <option value="year">سنة معينة</option>
                        <option value="custom">فترة مخصصة</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>

                  {filterType === 'month' && (
                    <>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>اختر الشهر</Form.Label>
                          <Form.Select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                          >
                            {ARABIC_MONTHS.map((m, i) => (
                              <option key={i} value={i}>
                                {m}
                              </option>
                            ))}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>اختر السنة</Form.Label>
                          <Form.Select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                          >
                            {renderYearOptions()}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                    </>
                  )}

                  {filterType === 'year' && (
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>اختر السنة</Form.Label>
                        <Form.Select
                          value={selectedYear}
                          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                        >
                          {renderYearOptions()}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  )}

                  {filterType === 'custom' && (
                    <>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>من تاريخ</Form.Label>
                          <Form.Control
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>إلى تاريخ</Form.Label>
                          <Form.Control
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                          />
                        </Form.Group>
                      </Col>
                    </>
                  )}
                </Row>
              </Form>
              {message.text && <Alert variant={message.type}>{message.text}</Alert>}
              <div className="d-flex justify-content-end">
                <Button variant="primary" onClick={handleFinancialExport}>
                  تصدير إلى Excel
                </Button>
              </div>
            </Card.Body>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>مركز التصدير والاستيراد</h1>
      </div>
      <p className="lead">
        تتيح هذه الواجهة استيراد وتصدير أنواع مختلفة من البيانات من وإلى التطبيق.
      </p>

      <Nav variant="tabs" activeKey={activeTab} onSelect={(k) => setActiveTab(k)} className="mb-3">
        <Nav.Item>
          <Nav.Link eventKey="import">استيراد البيانات</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="students">تصدير بيانات الطلاب</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="teachers">تصدير بيانات المعلمين</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="admins">تصدير بيانات المستخدمين</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="attendance">تصدير سجل الحضور</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="financials">تصدير التقارير المالية</Nav.Link>
        </Nav.Item>
      </Nav>

      <div className="content-panel">{renderActivePanel()}</div>
    </div>
  );
};

export default ExportsPage;
