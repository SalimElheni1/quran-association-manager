import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Nav } from 'react-bootstrap';
import '../styles/ExportsPage.css';

const ExportTabPanel = ({ exportType, fields, isAttendance = false }) => {
  const [selectedFields, setSelectedFields] = useState(fields.map((f) => f.key));
  const [message, setMessage] = useState({ type: '', text: '' });
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

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
      const field = fields.find((f) => f.key === key);
      return { header: field.label, key: field.key };
    });

    const exportOptions = {
      exportType,
      format,
      columns,
    };

    if (isAttendance) {
      if (!startDate || !endDate) {
        setMessage({ type: 'danger', text: 'الرجاء تحديد تاريخ بدء ونهاية صالحين.' });
        return;
      }
      exportOptions.options = { startDate, endDate };
    }

    try {
      const result = await window.electronAPI.generateExport(exportOptions);

      if (result.success) {
        setMessage({ type: 'success', text: `تم الحفظ بنجاح!` });
      } else {
        // Check for specific, user-fixable errors
        if (result.message.includes('TEMPLATE_NOT_FOUND')) {
          setMessage({ type: 'warning', text: 'فشل تصدير DOCX: ملف القالب "export_template.docx" غير موجود. يرجى إنشائه في المجلد الصحيح.' });
        } else if (result.message.includes('TEMPLATE_INVALID')) {
           setMessage({ type: 'warning', text: 'فشل تصدير DOCX: ملف القالب تالف أو فارغ. يرجى التأكد من أنه ملف Word صالح.' });
        } else {
            setMessage({ type: 'danger', text: `فشل التصدير: ${result.message}` });
        }
      }
    } catch (error) {
      setMessage({ type: 'danger', text: `حدث خطأ: ${error.message}` });
      console.error('Export failed:', error);
    }
  };

  return (
    <Card className="mt-3">
      <Card.Body>
        <Card.Title>
          تصدير {exportType === 'students'
            ? 'الطلاب'
            : exportType === 'teachers'
            ? 'المعلمين'
            : exportType === 'admins'
            ? 'الإداريين'
            : 'سجل الحضور'}
        </Card.Title>
        <p>اختر الحقول التي تريد تضمينها في التصدير.</p>
        <Form>
          {isAttendance && (
            <Row className="mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>تاريخ البدء</Form.Label>
                  <Form.Control
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>تاريخ الانتهاء</Form.Label>
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
            {fields.map((field) => (
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
            <Button variant="secondary" onClick={() => handleExport('docx')}>
              تصدير إلى DOCX
            </Button>
            <Button variant="primary" onClick={() => handleExport('xlsx')}>
              تصدير إلى Excel
            </Button>
            <Button variant="danger" onClick={() => handleExport('pdf')}>
              تصدير إلى PDF
            </Button>
          </div>
        </Form>
      </Card.Body>
    </Card>
  );
};

const ExportsPage = () => {
  const [activeTab, setActiveTab] = useState('students');

  const arabicFieldDefinitions = {
    students: [
      { key: 'name', label: 'الاسم الكامل' },
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
    ],
    teachers: [
      { key: 'name', label: 'الاسم الكامل' },
      { key: 'national_id', label: 'رقم الهوية' },
      { key: 'contact_info', label: 'رقم الهاتف' },
      { key: 'email', label: 'البريد الإلكتروني' },
      { key: 'specialization', label: 'التخصص' },
      { key: 'years_of_experience', label: 'سنوات الخبرة' },
    ],
    admins: [
      { key: 'username', label: 'اسم المستخدم' },
      { key: 'first_name', label: 'الاسم الأول' },
      { key: 'last_name', label: 'اسم العائلة' },
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

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'students':
        return <ExportTabPanel exportType="students" fields={arabicFieldDefinitions.students} />;
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
      default:
        return null;
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>تصدير البيانات</h1>
      </div>
      <p className="lead">
        تتيح هذه الوحدة تصدير أنواع مختلفة من البيانات من التطبيق إلى تنسيقات PDF أو Excel أو DOCX
        لإعداد التقارير والتحليل.
      </p>

      <Nav variant="tabs" activeKey={activeTab} onSelect={(k) => setActiveTab(k)} className="mb-3">
        <Nav.Item>
          <Nav.Link eventKey="students">الطلاب</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="teachers">المعلمين</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="admins">الإداريين</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="attendance">سجل الحضور</Nav.Link>
        </Nav.Item>
      </Nav>

      <div className="content-panel">{renderActivePanel()}</div>
    </div>
  );
};

export default ExportsPage;
