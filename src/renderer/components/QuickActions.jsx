import React from 'react';
import { Card, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import UserPlusIcon from './icons/UserPlusIcon';
import TeacherIcon from './icons/TeacherIcon';
import ClassesIcon from './icons/ClassesIcon';

function QuickActions() {
  const navigate = useNavigate();

  return (
    <Card className="h-100">
      <Card.Header as="h5">إجراءات سريعة</Card.Header>
      <Card.Body>
        <div className="d-grid gap-3">
          <Button variant="outline-primary" size="lg" onClick={() => navigate('/students')}>
            <UserPlusIcon className="me-2" />
            إضافة طالب جديد
          </Button>
          <Button variant="outline-success" size="lg" onClick={() => navigate('/teachers')}>
            <TeacherIcon className="me-2" />
            إضافة معلم جديد
          </Button>
          <Button variant="outline-info" size="lg" onClick={() => navigate('/classes')}>
            <ClassesIcon className="me-2" />
            إنشاء فصل جديد
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

export default QuickActions;
