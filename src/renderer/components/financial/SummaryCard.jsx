import React from 'react';
import { Card, Col } from 'react-bootstrap';

/**
 * SummaryCard - Display financial summary metric
 * @param {string} title - Card title
 * @param {number} value - Numeric value
 * @param {string} variant - Bootstrap color variant
 * @param {string} suffix - Optional suffix (e.g., 'TND')
 * @param {number} [decimals] - Decimal places; amounts (with a currency suffix) show 2, counts
 *   (no suffix) show whole numbers.
 */
function SummaryCard({ title, value, variant = 'primary', suffix = 'د.ت', decimals }) {
  const fractionDigits = decimals ?? (suffix ? 2 : 0);
  const formatValue = (val) => {
    if (val === null || val === undefined) return '...';
    return new Intl.NumberFormat('ar-TN', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(val);
  };

  return (
    <Col md={6} lg={3} className="mb-3">
      <Card className={`border-${variant}`}>
        <Card.Body>
          <Card.Title className="text-muted small">{title}</Card.Title>
          <h3 className={`text-${variant} mb-0`}>
            {formatValue(value)} {suffix}
          </h3>
        </Card.Body>
      </Card>
    </Col>
  );
}

export default SummaryCard;
