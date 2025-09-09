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
import '@renderer/styles/ExportsPage.css';

const ExportTabPanel = ({ exportType, fields, kidFields = [], isAttendance = false }) => {
  const [genderFilter, setGenderFilter] = useState('all');
  const [selectedFields, setSelectedFields] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('all');

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
      exportOptions.options.gender = genderFilter;
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
            text: 'فشل تصدير DOCX: ملف القالب "export_template.docx" غير موجود. يرجى إنشائه في المجلد الصحيح.',
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

  const isExportDisabled = selectedFields.length === 0 || selectedFields.length > 4;

  const renderPdfButton = () => {
    const button = (
      <Button
        variant="danger"
        onClick={() => handleExport('pdf')}
        disabled={isExportDisabled}
        style={isExportDisabled ? { pointerEvents: 'none' } : {}}
      >
        تصدير إلى PDF
      </Button>
    );

    if (isExportDisabled) {
      return (
        <OverlayTrigger
          overlay={
            <Tooltip id="tooltip-pdf-disabled">لتصدير PDF، الرجاء تحديد ما بين 1 و 4 حقول.</Tooltip>
          }
        >
          <span className="d-inline-block">{button}</span>
        </OverlayTrigger>
      );
    }
    return button;
  };

  const renderDocxButton = () => {
    const button = (
      <Button
        variant="secondary"
        onClick={() => handleExport('docx')}
        disabled={isExportDisabled}
        style={isExportDisabled ? { pointerEvents: 'none' } : {}}
      >
        تصدير إلى DOCX
      </Button>
    );

    if (isExportDisabled) {
      return (
        <OverlayTrigger
          overlay={
            <Tooltip id="tooltip-docx-disabled">
              لتصدير DOCX، الرجاء تحديد ما بين 1 و 4 حقول.
            </Tooltip>
          }
        >
          <span className="d-inline-block">{button}</span>
        </OverlayTrigger>
      );
    }
    return button;
  };

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

          {message.text && <Alert variant={message.type}>{message.text}</Alert>}

          <div className="d-flex justify-content-end gap-2">
            {renderDocxButton()}
            <Button variant="primary" onClick={() => handleExport('xlsx')}>
              تصدير إلى Excel
            </Button>
            {renderPdfButton()}
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
    setIsLoading(true);
    setMessage({ type: '', text: '' });
    setImportResults(null);
    try {
      const result = await window.electronAPI.executeImport();
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
        <div className="d-flex justify-content-start gap-2 mb-3">
          <Button variant="primary" onClick={handleGenerateTemplate} disabled={isLoading}>
            {isLoading ? 'جاري الإنشاء...' : '1. إنشاء قالب Excel'}
          </Button>
          <Button variant="success" onClick={handleImport} disabled={isLoading}>
            {isLoading ? 'جاري الاستيراد...' : '2. استيراد ملف Excel'}
          </Button>
          {/* {process.env.NODE_ENV === 'development' && (
            <Button variant="warning" onClick={handleGenerateDevTemplate} disabled={isLoading}>
              {isLoading ? 'جاري الإنشاء...' : 'إنشاء قالب تطوير'}
            </Button>
          )} */}
        </div>

        {message.text && <Alert variant={message.type}>{message.text}</Alert>}

        {importResults && (
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
      </Card.Body>
    </Card>
  );
};

const ExportsPage = () => {
  const [activeTab, setActiveTab] = useState('students');
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleFinancialExport = async () => {
    setMessage({ type: '', text: '' });
    try {
      const result = await window.electronAPI.generateExport({
        exportType: 'financial-report',
        format: 'xlsx',
      });
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
                تصدير ملف Excel يحتوي على جميع البيانات المالية: ملخص شامل، رسوم الطلاب، الرواتب،
                التبرعات، والمصاريف العامة.
              </p>
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
