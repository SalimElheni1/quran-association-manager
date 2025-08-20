import React from 'react';
import { Card, Col, Spinner } from 'react-bootstrap';

function StatCard({ title, value, icon, variant }) {
  return (
    <Col md={6} lg={4} className="mb-4">
      <Card className={`stat-card border-${variant}`}>
        <Card.Body>
          <div className="stat-card-content">
            <Card.Title>{title}</Card.Title>
            <Card.Text>
              {/* We'll show a spinner while loading later */}
              {value ?? '...'}
            </Card.Text>
          </div>
          <div className="stat-card-icon">
            <i className={icon}></i>
          </div>
        </Card.Body>
      </Card>
    </Col>
  );
}

export default StatCard;
