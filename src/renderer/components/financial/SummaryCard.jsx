import React from 'react';
import { Card, Col } from 'react-bootstrap';
import { formatTND, formatCount } from '@renderer/utils/formatCurrency';

/**
 * SummaryCard - Display financial summary metric
 * @param {string} title - Card title
 * @param {number} value - Numeric value
 * @param {string} variant - Bootstrap color variant
 * @param {string} suffix - Optional suffix (e.g., 'TND')
 */
function SummaryCard({ title, value, variant = 'primary', suffix = 'د.ت' }) {
  const formatValue = (val) => {
    if (val === null || val === undefined) return '...';
    
    // If suffix is empty, it's a count - use 0 decimals
    // If suffix is 'د.ت' or other currency, use 3 decimals for Tunisian millemes
    const isCount = !suffix || suffix === '';
    
    return isCount ? formatCount(val) : formatTND(val, 3);
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
