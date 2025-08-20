import React from 'react';
import { Card, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

function QuickActions() {
  const navigate = useNavigate();

  return (
    <Card className="h-100">
      <Card.Header as="h5">إجراءات سريعة</Card.Header>
      <Card.Body>
        <div className="d-grid gap-3">
          <Button variant="outline-primary" size="lg" onClick={() => navigate('/students')}>
            <i className="fas fa-user-plus me-2"></i>
            إضافة طالب جديد
          </Button>
          <Button variant="outline-success" size="lg" onClick={() => navigate('/teachers')}>
            <i className="fas fa-chalkboard-teacher me-2"></i>
            إضافة معلم جديد
          </Button>
          <Button variant="outline-info" size="lg" onClick={() => navigate('/classes')}>
            <i className="fas fa-school me-2"></i>
            إنشاء فصل جديد
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

export default QuickActions;
