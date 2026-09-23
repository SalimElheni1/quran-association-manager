import React from 'react';
import { Card } from 'react-bootstrap';
import { Spinner } from 'react-bootstrap';
import { Row, Col } from 'react-bootstrap';
import './Charts.css';

/**
 * ChartCard — shared shell for dashboard charts.
 * Handles loading / empty / footer states consistently across all charts.
 *
 * @param {string} title - Card title
 * @param {ReactNode} children - the chart's SVG/axis content
 * @param {boolean} loading - show spinner while data is loading
 * @param {boolean} empty - show the empty state instead of children
 * @param {ReactNode} footer - optional footer (e.g. legend / summary line)
 */
function ChartCard({ title, subtitle, children, loading = false, empty = false, footer, height = 240 }) {
  return (
    <Card className="chart-card h-100">
      <Card.Header className="chart-card-header">
        <h5 className="chart-card-title mb-0">{title}</h5>
        {subtitle && <div className="chart-card-subtitle">{subtitle}</div>}
      </Card.Header>
      <Card.Body className="chart-card-body">
        {loading ? (
          <div className="chart-state chart-state--loading">
            <Spinner animation="border" size="sm" aria-hidden="true" />
            <span>جاري تحميل البيانات...</span>
          </div>
        ) : empty ? (
          <div className="chart-state chart-state--empty">لا توجد بيانات كافية لعرض هذا الرسم بعد.</div>
        ) : (
          children
        )}
      </Card.Body>
      {footer && <Card.Footer className="chart-card-footer">{footer}</Card.Footer>}
    </Card>
  );
}

export default ChartCard;
