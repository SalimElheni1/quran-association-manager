import React, { useState } from 'react';
import { Card, Button, Form, Row, Col, Alert } from 'react-bootstrap';
import { error as logError } from '@renderer/utils/logger';
import { toLocalISODate } from '@renderer/utils/dates';

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

/** The chosen period as { startDate, endDate }, or null when a custom period is incomplete. */
const periodOf = ({ filterType, year, month, startDate, endDate }) => {
  if (filterType === 'month') {
    return {
      startDate: toLocalISODate(new Date(year, month, 1)),
      endDate: toLocalISODate(new Date(year, month + 1, 0)),
    };
  }
  if (filterType === 'year') {
    return {
      startDate: toLocalISODate(new Date(year, 0, 1)),
      endDate: toLocalISODate(new Date(year, 11, 31)),
    };
  }
  return startDate && endDate ? { startDate, endDate } : null;
};

function PeriodFields({ value, onChange }) {
  const set = (field) => (e) => onChange({ ...value, [field]: e.target.value });
  const setNumber = (field) => (e) => onChange({ ...value, [field]: parseInt(e.target.value) });
  const yearField = (
    <Col md={3}>
      <Form.Group>
        <Form.Label>اختر السنة</Form.Label>
        <Form.Select value={value.year} onChange={setNumber('year')}>
          {renderYearOptions()}
        </Form.Select>
      </Form.Group>
    </Col>
  );

  return (
    <Row className="mb-3 align-items-end">
      <Col md={3}>
        <Form.Group>
          <Form.Label>نوع الفترة</Form.Label>
          <Form.Select value={value.filterType} onChange={set('filterType')}>
            <option value="month">شهر معين</option>
            <option value="year">سنة معينة</option>
            <option value="custom">فترة مخصصة</option>
          </Form.Select>
        </Form.Group>
      </Col>

      {value.filterType === 'month' && (
        <>
          <Col md={3}>
            <Form.Group>
              <Form.Label>اختر الشهر</Form.Label>
              <Form.Select value={value.month} onChange={setNumber('month')}>
                {ARABIC_MONTHS.map((m, i) => (
                  <option key={i} value={i}>
                    {m}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          {yearField}
        </>
      )}

      {value.filterType === 'year' && yearField}

      {value.filterType === 'custom' && (
        <>
          <Col md={3}>
            <Form.Group>
              <Form.Label>من تاريخ</Form.Label>
              <Form.Control type="date" value={value.startDate} onChange={set('startDate')} />
            </Form.Group>
          </Col>
          <Col md={3}>
            <Form.Group>
              <Form.Label>إلى تاريخ</Form.Label>
              <Form.Control type="date" value={value.endDate} onChange={set('endDate')} />
            </Form.Group>
          </Col>
        </>
      )}
    </Row>
  );
}

/**
 * One report: its description, a period when it takes one, the export button and the result.
 * @param {object} props
 * @param {(period?: object) => Promise<{cancelled?: boolean, success?: boolean, message?: string}>} props.onExport
 */
function ReportCard({
  title,
  description,
  withPeriod,
  buttonVariant,
  buttonLabel,
  successText,
  onExport,
}) {
  const [period, setPeriod] = useState({
    filterType: 'month',
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    startDate: '',
    endDate: '',
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setMessage({ type: '', text: '' });
    setLoading(true);

    try {
      let result;
      if (withPeriod) {
        const chosen = periodOf(period);
        if (!chosen) {
          setMessage({ type: 'danger', text: 'الرجاء تحديد تاريخ بدء وانتهاء صالحين.' });
          return;
        }
        result = await onExport({ period: chosen });
      } else {
        result = await onExport();
      }

      if (result.cancelled) {
        setMessage({ type: 'info', text: 'تم إلغاء التصدير.' });
      } else if (result.success) {
        setMessage({ type: 'success', text: successText });
      } else {
        setMessage({ type: 'danger', text: `فشل التصدير: ${result.message}` });
      }
    } catch (error) {
      setMessage({ type: 'danger', text: `حدث خطأ: ${error.message}` });
      logError('Export failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const button = (
    <Button variant={buttonVariant} onClick={handleExport} disabled={loading}>
      {loading ? 'جاري التصدير...' : buttonLabel}
    </Button>
  );

  return (
    <Card className="mb-4">
      <Card.Header className="bg-light">
        <h5 className="mb-0">{title}</h5>
      </Card.Header>
      <Card.Body>
        <p className="small text-muted">{description}</p>

        {withPeriod ? (
          <Form>
            <PeriodFields value={period} onChange={setPeriod} />
            {button}
          </Form>
        ) : (
          button
        )}

        {message.text && (
          <Alert variant={message.type} className="mt-3">
            {message.text}
          </Alert>
        )}
      </Card.Body>
    </Card>
  );
}

function FinancialReportsTab() {
  return (
    <div>
      <Card>
        <Card.Header as="h4">التقارير المالية</Card.Header>
        <Card.Body>
          <p className="text-muted">
            قم بتصدير التقارير المالية بصيغة Word أو Excel مع تنسيق احترافي وتفاصيل كاملة.
          </p>

          <ReportCard
            title="التقرير المالي"
            description="تقرير شامل يتضمن: السيولة، المداخيل، المصاريف، والرصيد النهائي مع تفاصيل كاملة."
            withPeriod
            buttonVariant="primary"
            buttonLabel="تصدير التقرير المالي (Word)"
            successText="تم تصدير التقرير المالي بنجاح!"
            onExport={(request) => window.electronAPI.exportFinancialReportWord(request)}
          />

          <ReportCard
            title="📒 سجل المحاسبة الشهري"
            description="سجل محاسبي شهري مفصل يتضمن: الرصيد الافتتاحي، جميع العمليات، والرصيد النهائي بصيغة Excel."
            withPeriod
            buttonVariant="success"
            buttonLabel="تصدير سجل المحاسبة (Excel)"
            successText="تم تصدير سجل المحاسبة بنجاح!"
            onExport={(request) => window.electronAPI.exportCashLedger(request)}
          />

          <ReportCard
            title="سجل الجرد"
            description="سجل الأصول الملموسة مجمعة حسب الفئة بصيغة Excel."
            buttonVariant="info"
            buttonLabel="تصدير سجل الجرد (Excel)"
            successText="تم تصدير سجل الجرد بنجاح!"
            onExport={() => window.electronAPI.exportInventoryLedger()}
          />
        </Card.Body>
      </Card>
    </div>
  );
}

export default FinancialReportsTab;
