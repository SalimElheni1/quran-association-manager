import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, Form, Row, Col, Alert } from 'react-bootstrap';
import { error as logError } from '@renderer/utils/logger';

const ExportModal = ({
  show,
  handleClose,
  exportType,
  fields,
  kidFields = [],
  isAttendance = false,
  title,
}) => {
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
  }, [isAttendance, exportType]);

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
        if (result.message.includes('TEMPLATE_NOT_FOUND')) {
          setMessage({
            type: 'warning',
            text: 'فشل تصدير DOCX: ملف القالب "export_template_v2.docx" غير موجود.',
          });
        } else if (result.message.includes('TEMPLATE_INVALID')) {
          setMessage({
            type: 'warning',
            text: 'فشل تصدير DOCX: ملف القالب تالف أو فارغ.',
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
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
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
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          إغلاق
        </Button>
        <Button variant="primary" onClick={() => handleExport('xlsx')} disabled={isExportDisabled}>
          تصدير إلى Excel
        </Button>
        <Button variant="success" onClick={() => handleExport('docx')} disabled={isExportDisabled}>
          تصدير إلى DOCX
        </Button>
        <Button variant="danger" onClick={() => handleExport('pdf')} disabled={isExportDisabled}>
          تصدير إلى PDF
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ExportModal;
