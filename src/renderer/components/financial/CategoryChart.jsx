import React from 'react';
import { Card } from 'react-bootstrap';

/**
 * CategoryChart - Display category breakdown as simple list
 * @param {string} title - Chart title
 * @param {Array} data - Array of {category, amount}
 * @param {string} variant - Color variant
 */
function CategoryChart({ title, data = [], variant = 'primary' }) {
  const total = data.reduce((sum, item) => sum + (item.total || item.amount || 0), 0);

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('ar-TN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  const getPercentage = (amount) => {
    if (total === 0) return 0;
    return ((amount / total) * 100).toFixed(1);
  };

  return (
    <Card>
      <Card.Header className={`bg-${variant} text-white`}>
        <h5 className="mb-0">{title}</h5>
      </Card.Header>
      <Card.Body>
        {data.length === 0 ? (
          <p className="text-muted text-center">لا توجد بيانات</p>
        ) : (
          <div className="category-list">
            {data.map((item, index) => {
              const amount = item.total || item.amount || 0;
              return (
                <div key={index} className="category-item mb-3">
                  <div className="d-flex justify-content-between mb-1">
                    <span>{item.category}</span>
                    <span className="fw-bold">{formatAmount(amount)} د.ت</span>
                  </div>
                  <div className="progress" style={{ height: '8px' }}>
                    <div
                      className={`progress-bar bg-${variant}`}
                      style={{ width: `${getPercentage(amount)}%` }}
                    />
                  </div>
                  <small className="text-muted">{getPercentage(amount)}%</small>
                </div>
              );
            })}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

export default CategoryChart;
