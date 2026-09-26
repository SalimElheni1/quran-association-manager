import React from 'react';
import { Form, Row, Col } from 'react-bootstrap';
import { toLocalISODate } from '@renderer/utils/dates';

/**
 * Returns the date range of a preset period around `today`.
 * @param {string} preset month | quarter | semester | year | academicYear
 * @param {Date} [today]
 * @returns {{startDate: string, endDate: string} | null} null for an unknown preset
 */
export function getPresetPeriod(preset, today = new Date()) {
  let startDate, endDate;

  switch (preset) {
    case 'month':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      break;
    case 'quarter': {
      const quarter = Math.floor(today.getMonth() / 3);
      startDate = new Date(today.getFullYear(), quarter * 3, 1);
      endDate = new Date(today.getFullYear(), quarter * 3 + 3, 0);
      break;
    }
    case 'semester': {
      const semester = today.getMonth() < 6 ? 0 : 1;
      startDate = new Date(today.getFullYear(), semester * 6, 1);
      endDate = new Date(today.getFullYear(), semester * 6 + 6, 0);
      break;
    }
    case 'year':
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today.getFullYear(), 11, 31);
      break;
    case 'academicYear': {
      // The academic year runs from September to August.
      const startYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
      startDate = new Date(startYear, 8, 1);
      endDate = new Date(startYear + 1, 7, 31);
      break;
    }
    default:
      return null;
  }

  return {
    startDate: toLocalISODate(startDate),
    endDate: toLocalISODate(endDate),
  };
}

/**
 * PeriodSelector - Select predefined or custom date ranges
 * @param {Object} period - Current period {startDate, endDate}
 * @param {Function} onChange - Callback when period changes
 * @param {string} [preset] - Selected preset; when given, the selector is controlled and editing
 *   a date switches it to 'custom'
 * @param {Function} [onPresetChange] - Callback when the preset changes
 */
function PeriodSelector({ period, onChange, preset, onPresetChange }) {
  const isControlled = preset !== undefined;

  const handlePresetChange = (e) => {
    const value = e.target.value;
    const next = getPresetPeriod(value);
    if (!next) return;
    if (onPresetChange) onPresetChange(value);
    onChange(next);
  };

  const handleDateChange = (field, value) => {
    if (onPresetChange) onPresetChange('custom');
    onChange({ ...period, [field]: value });
  };

  return (
    <Row className="mb-3">
      <Col md={4}>
        <Form.Group>
          <Form.Label>الفترة</Form.Label>
          <Form.Select
            {...(isControlled ? { value: preset } : {})}
            onChange={handlePresetChange}
            aria-label="الفترة"
          >
            {!isControlled && <option value="">اختر فترة</option>}
            <option value="month">الشهر الحالي</option>
            <option value="quarter">الربع الحالي</option>
            <option value="semester">النصف السنوي</option>
            <option value="year">السنة الحالية</option>
            <option value="academicYear">السنة الدراسية الحالية</option>
            {isControlled && preset === 'custom' && <option value="custom">فترة مخصصة</option>}
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
