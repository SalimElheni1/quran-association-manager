import React, { useState } from 'react';
import { Card, Button, Form, Row, Col, Alert } from 'react-bootstrap';
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

function FinancialReportsTab() {
  // Word Report State
  const [wordFilterType, setWordFilterType] = useState('month');
  const [wordYear, setWordYear] = useState(new Date().getFullYear());
  const [wordMonth, setWordMonth] = useState(new Date().getMonth());
  const [wordStartDate, setWordStartDate] = useState('');
  const [wordEndDate, setWordEndDate] = useState('');
  const [wordMessage, setWordMessage] = useState({ type: '', text: '' });
  const [wordLoading, setWordLoading] = useState(false);

  // Excel Ledger State
  const [ledgerFilterType, setLedgerFilterType] = useState('month');
  const [ledgerYear, setLedgerYear] = useState(new Date().getFullYear());
  const [ledgerMonth, setLedgerMonth] = useState(new Date().getMonth());
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState('');
  const [ledgerMessage, setLedgerMessage] = useState({ type: '', text: '' });
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Inventory Ledger State
  const [inventoryMessage, setInventoryMessage] = useState({ type: '', text: '' });
  const [inventoryLoading, setInventoryLoading] = useState(false);

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

  const getWordPeriod = () => {
    if (wordFilterType === 'month') {
      return {
        startDate: new Date(wordYear, wordMonth, 1).toISOString().split('T')[0],
        endDate: new Date(wordYear, wordMonth + 1, 0).toISOString().split('T')[0],
      };
    } else if (wordFilterType === 'year') {
      return {
        startDate: new Date(wordYear, 0, 1).toISOString().split('T')[0],
        endDate: new Date(wordYear, 11, 31).toISOString().split('T')[0],
      };
    } else if (wordFilterType === 'custom') {
      return wordStartDate && wordEndDate
        ? { startDate: wordStartDate, endDate: wordEndDate }
        : null;
    }
  };

  const getLedgerPeriod = () => {
    if (ledgerFilterType === 'month') {
      return {
        startDate: new Date(ledgerYear, ledgerMonth, 1).toISOString().split('T')[0],
        endDate: new Date(ledgerYear, ledgerMonth + 1, 0).toISOString().split('T')[0],
      };
    } else if (ledgerFilterType === 'year') {
      return {
        startDate: new Date(ledgerYear, 0, 1).toISOString().split('T')[0],
        endDate: new Date(ledgerYear, 11, 31).toISOString().split('T')[0],
      };
    } else if (ledgerFilterType === 'custom') {
      return ledgerStartDate && ledgerEndDate
        ? { startDate: ledgerStartDate, endDate: ledgerEndDate }
        : null;
    }
  };

  const handleExportFinancialReport = async () => {
    setWordMessage({ type: '', text: '' });
    setWordLoading(true);

    try {
      const period = getWordPeriod();
      if (!period) {
        setWordMessage({ type: 'danger', text: 'الرجاء تحديد تاريخ بدء وانتهاء صالحين.' });
        setWordLoading(false);
        return;
      }

      const result = await window.electronAPI.exportFinancialReportWord({ period });

      if (result.cancelled) {
        setWordMessage({ type: 'info', text: 'تم إلغاء التصدير.' });
      } else if (result.success) {
        setWordMessage({ type: 'success', text: '✅ تم تصدير التقرير المالي بنجاح!' });
      } else {
        setWordMessage({ type: 'danger', text: `✖️ فشل التصدير: ${result.message}` });
      }
    } catch (error) {
      setWordMessage({ type: 'danger', text: `✖️ حدث خطأ: ${error.message}` });
      logError('Export failed:', error);
    } finally {
      setWordLoading(false);
    }
  };

  const handleExportCashLedger = async () => {
    setLedgerMessage({ type: '', text: '' });
    setLedgerLoading(true);

    try {
      const period = getLedgerPeriod();
      if (!period) {
        setLedgerMessage({ type: 'danger', text: 'الرجاء تحديد تاريخ بدء وانتهاء صالحين.' });
        setLedgerLoading(false);
        return;
      }

      const result = await window.electronAPI.exportCashLedger({ period });

      if (result.cancelled) {
        setLedgerMessage({ type: 'info', text: 'تم إلغاء التصدير.' });
      } else if (result.success) {
        setLedgerMessage({ type: 'success', text: '✅ تم تصدير سجل المحاسبة بنجاح!' });
      } else {
        setLedgerMessage({ type: 'danger', text: `✖️ فشل التصدير: ${result.message}` });
      }
    } catch (error) {
      setLedgerMessage({ type: 'danger', text: `✖️ حدث خطأ: ${error.message}` });
      logError('Export failed:', error);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleExportInventoryLedger = async () => {
    setInventoryMessage({ type: '', text: '' });
    setInventoryLoading(true);

    try {
      const result = await window.electronAPI.exportInventoryLedger();

      if (result.cancelled) {
        setInventoryMessage({ type: 'info', text: 'تم إلغاء التصدير.' });
      } else if (result.success) {
        setInventoryMessage({ type: 'success', text: '✅ تم تصدير سجل الجرد بنجاح!' });
      } else {
        setInventoryMessage({ type: 'danger', text: `✖️ فشل التصدير: ${result.message}` });
      }
    } catch (error) {
      setInventoryMessage({ type: 'danger', text: `✖️ حدث خطأ: ${error.message}` });
      logError('Export failed:', error);
    } finally {
      setInventoryLoading(false);
    }
  };

  return (
    <div>
      <Card>
        <Card.Header as="h4">📊 التقارير المالية</Card.Header>
        <Card.Body>
          <p className="text-muted">
            قم بتصدير التقارير المالية بصيغة Word أو Excel مع تنسيق احترافي وتفاصيل كاملة.
          </p>

          <Card className="mb-4">
            <Card.Header className="bg-light">
              <h5 className="mb-0">📄 تقرير مالي مجمل</h5>
            </Card.Header>
            <Card.Body>
              <p className="small text-muted">
                تقرير شامل يتضمن: السيولة، المداخيل، المصاريف، والرصيد النهائي مع تفاصيل كاملة.
              </p>

              <Form>
                <Row className="mb-3 align-items-end">
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label>نوع الفترة</Form.Label>
                      <Form.Select
                        value={wordFilterType}
                        onChange={(e) => setWordFilterType(e.target.value)}
                      >
                        <option value="month">شهر معين</option>
                        <option value="year">سنة معينة</option>
                        <option value="custom">فترة مخصصة</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>

                  {wordFilterType === 'month' && (
                    <>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>اختر الشهر</Form.Label>
                          <Form.Select
                            value={wordMonth}
                            onChange={(e) => setWordMonth(parseInt(e.target.value))}
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
                            value={wordYear}
                            onChange={(e) => setWordYear(parseInt(e.target.value))}
                          >
                            {renderYearOptions()}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                    </>
                  )}

                  {wordFilterType === 'year' && (
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>اختر السنة</Form.Label>
                        <Form.Select
                          value={wordYear}
                          onChange={(e) => setWordYear(parseInt(e.target.value))}
                        >
                          {renderYearOptions()}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  )}

                  {wordFilterType === 'custom' && (
                    <>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>من تاريخ</Form.Label>
                          <Form.Control
                            type="date"
                            value={wordStartDate}
                            onChange={(e) => setWordStartDate(e.target.value)}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>إلى تاريخ</Form.Label>
                          <Form.Control
                            type="date"
                            value={wordEndDate}
                            onChange={(e) => setWordEndDate(e.target.value)}
                          />
                        </Form.Group>
                      </Col>
                    </>
                  )}
                </Row>

                <Button
                  variant="primary"
                  onClick={handleExportFinancialReport}
                  disabled={wordLoading}
                >
                  {wordLoading ? '⏳ جاري التصدير...' : '📥 تصدير التقرير المالي (Word)'}
                </Button>
              </Form>

              {wordMessage.text && (
                <Alert variant={wordMessage.type} className="mt-3">
                  {wordMessage.text}
                </Alert>
              )}
            </Card.Body>
          </Card>

          <Card className="mb-4">
            <Card.Header className="bg-light">
              <h5 className="mb-0">📒 تقرير مالي مفصل</h5>
            </Card.Header>
            <Card.Body>
              <p className="small text-muted">
                سجل محاسبي شهري مفصل يتضمن: الرصيد الافتتاحي، جميع العمليات، والرصيد النهائي بصيغة
                Excel.
              </p>

              <Form>
                <Row className="mb-3 align-items-end">
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label>نوع الفترة</Form.Label>
                      <Form.Select
                        value={ledgerFilterType}
                        onChange={(e) => setLedgerFilterType(e.target.value)}
                      >
                        <option value="month">شهر معين</option>
                        <option value="year">سنة معينة</option>
                        <option value="custom">فترة مخصصة</option>
                      </Form.Select>
                    </Form.Group>
                  </Col>

                  {ledgerFilterType === 'month' && (
                    <>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>اختر الشهر</Form.Label>
                          <Form.Select
                            value={ledgerMonth}
                            onChange={(e) => setLedgerMonth(parseInt(e.target.value))}
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
                            value={ledgerYear}
                            onChange={(e) => setLedgerYear(parseInt(e.target.value))}
                          >
                            {renderYearOptions()}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                    </>
                  )}

                  {ledgerFilterType === 'year' && (
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>اختر السنة</Form.Label>
                        <Form.Select
                          value={ledgerYear}
                          onChange={(e) => setLedgerYear(parseInt(e.target.value))}
                        >
                          {renderYearOptions()}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  )}

                  {ledgerFilterType === 'custom' && (
                    <>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>من تاريخ</Form.Label>
                          <Form.Control
                            type="date"
                            value={ledgerStartDate}
                            onChange={(e) => setLedgerStartDate(e.target.value)}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label>إلى تاريخ</Form.Label>
                          <Form.Control
                            type="date"
                            value={ledgerEndDate}
                            onChange={(e) => setLedgerEndDate(e.target.value)}
                          />
                        </Form.Group>
                      </Col>
                    </>
                  )}
                </Row>

                <Button variant="success" onClick={handleExportCashLedger} disabled={ledgerLoading}>
                  {ledgerLoading ? '⏳ جاري التصدير...' : '📅 تصدير سجل المحاسبة (Excel)'}
                </Button>
              </Form>

              {ledgerMessage.text && (
                <Alert variant={ledgerMessage.type} className="mt-3">
                  {ledgerMessage.text}
                </Alert>
              )}
            </Card.Body>
          </Card>

          <Card className="mb-4">
            <Card.Header className="bg-light">
              <h5 className="mb-0">📦 سجل الجرد</h5>
            </Card.Header>
            <Card.Body>
              <p className="small text-muted">سجل الأصول الملموسة مجمعة حسب الفئة بصيغة Excel.</p>

              <Button
                variant="info"
                onClick={handleExportInventoryLedger}
                disabled={inventoryLoading}
              >
                {inventoryLoading ? '⏳ جاري التصدير...' : '📊 تصدير سجل الجرد (Excel)'}
              </Button>

              {inventoryMessage.text && (
                <Alert variant={inventoryMessage.type} className="mt-3">
                  {inventoryMessage.text}
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Card.Body>
      </Card>
    </div>
  );
}

export default FinancialReportsTab;
