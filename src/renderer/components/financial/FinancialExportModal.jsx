import React, { useState } from 'react';
import { Modal, Button, Form, Row, Col, Alert } from 'react-bootstrap';
import { error as logError } from '@renderer/utils/logger';

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

function FinancialExportModal({ show, handleClose }) {
  const [message, setMessage] = useState({ type: '', text: '' });
  const [reportType, setReportType] = useState('cash-ledger');
  const [filterType, setFilterType] = useState('month');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const handleFinancialExport = async () => {
    setMessage({ type: '', text: '' });

    let period;

    if (filterType === 'month') {
      const startDate = new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0];
      const endDate = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split('T')[0];
      period = { startDate, endDate };
    } else if (filterType === 'year') {
      const startDate = new Date(selectedYear, 0, 1).toISOString().split('T')[0];
      const endDate = new Date(selectedYear, 11, 31).toISOString().split('T')[0];
      period = { startDate, endDate };
    } else if (filterType === 'custom') {
      if (!customStartDate || !customEndDate) {
        setMessage({
          type: 'danger',
          text: 'الرجاء تحديد تاريخ بدء وانتهاء صالحين.',
        });
        return;
      }
      period = { startDate: customStartDate, endDate: customEndDate };
    } else {
      const firstTransaction = await window.electronAPI.getTransactions({ limit: 1 });
      const startDate =
        firstTransaction[0]?.transaction_date || new Date().toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];
      period = { startDate, endDate };
    }

    try {
      let result;
      if (reportType === 'cash-ledger') {
        result = await window.electronAPI.exportCashLedger({ period });
      } else if (reportType === 'inventory-register') {
        result = await window.electronAPI.exportInventoryRegister({ period });
      } else if (reportType === 'financial-summary') {
        result = await window.electronAPI.exportFinancialSummary({ period });
      }

      if (result.cancelled) {
        setMessage({ type: 'info', text: 'تم إلغاء التصدير.' });
      } else if (result.success) {
        setMessage({ type: 'success', text: '✅ تم تصدير التقرير بنجاح!' });
      } else {
        setMessage({ type: 'danger', text: `✖️ فشل التصدير: ${result.message}` });
      }
    } catch (error) {
      setMessage({ type: 'danger', text: `✖️ حدث خطأ: ${error.message}` });
      logError('Export failed:', error);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>تصدير التقارير المالية</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>اختر نوع التقرير والفترة الزمنية للتصدير.</p>

        <Form>
          <Row className="mb-4">
            <Col md={12}>
              <Form.Group>
                <Form.Label className="fw-bold">نوع التقرير</Form.Label>
                <div className="d-flex gap-3 mt-2">
                  <Form.Check
                    type="radio"
                    id="report-cash-ledger"
                    name="reportType"
                    label="📒 التقرير المالي المفصل"
                    value="cash-ledger"
                    checked={reportType === 'cash-ledger'}
                    onChange={(e) => setReportType(e.target.value)}
                  />
                  <Form.Check
                    type="radio"
                    id="report-inventory"
                    name="reportType"
                    label="📦 سجل الجرد"
                    value="inventory-register"
                    checked={reportType === 'inventory-register'}
                    onChange={(e) => setReportType(e.target.value)}
                  />
                  <Form.Check
                    type="radio"
                    id="report-summary"
                    name="reportType"
                    label="📊 التقرير المالي المجمل"
                    value="financial-summary"
                    checked={reportType === 'financial-summary'}
                    onChange={(e) => setReportType(e.target.value)}
                  />
                </div>
              </Form.Group>
            </Col>
          </Row>

          <Row className="mb-3 align-items-end">
            <Col md={3}>
              <Form.Group>
                <Form.Label>نوع الفترة</Form.Label>
                <Form.Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
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
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          إغلاق
        </Button>
        <Button variant="success" onClick={handleFinancialExport}>
          📄 تصدير التقرير
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default FinancialExportModal;
