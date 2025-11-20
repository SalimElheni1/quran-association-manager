import React from 'react';
import { Form, Row, Col } from 'react-bootstrap';

/**
 * PeriodSelector - Select predefined or custom date ranges
 * @param {Object} period - Current period {startDate, endDate}
 * @param {Function} onChange - Callback when period changes
 */
function PeriodSelector({ period, onChange }) {
  const handlePresetChange = (e) => {
    const preset = e.target.value;
    const today = new Date();
    let startDate, endDate;

    switch (preset) {
      case 'month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'quarter':
        const quarter = Math.floor(today.getMonth() / 3);
        startDate = new Date(today.getFullYear(), quarter * 3, 1);
        endDate = new Date(today.getFullYear(), quarter * 3 + 3, 0);
        break;
      case 'semester':
        const semester = today.getMonth() < 6 ? 0 : 1;
        startDate = new Date(today.getFullYear(), semester * 6, 1);
        endDate = new Date(today.getFullYear(), semester * 6 + 6, 0);
        break;
      case 'year':
        startDate = new Date(today.getFullYear(), 0, 1);
        endDate = new Date(today.getFullYear(), 11, 31);
        break;
      default:
        return;
    }

    onChange({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    });
  };

  const handleDateChange = (field, value) => {
    onChange({ ...period, [field]: value });
  };

  return (
    <Row className="mb-3">
      <Col md={4}>
        <Form.Group>
          <Form.Label>الفترة</Form.Label>
          <Form.Select onChange={handlePresetChange}>
            <option value="">اختر فترة</option>
            <option value="month">الشهر الحالي</option>
            <option value="quarter">الربع الحالي</option>
            <option value="semester">النصف السنوي</option>
            <option value="year">السنة الحالية</option>
          </Form.Select>
        </Form.Group>
      </Col>
      <Col md={4}>
        <Form.Group>
          <Form.Label>من تاريخ</Form.Label>
          <Form.Control
            type="date"
            value={period?.startDate || ''}
            onChange={(e) => handleDateChange('startDate', e.target.value)}
          />
        </Form.Group>
      </Col>
      <Col md={4}>
        <Form.Group>
          <Form.Label>إلى تاريخ</Form.Label>
          <Form.Control
            type="date"
            value={period?.endDate || ''}
            onChange={(e) => handleDateChange('endDate', e.target.value)}
          />
        </Form.Group>
      </Col>
    </Row>
  );
}

export default PeriodSelector;
