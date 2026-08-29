import React from 'react';
import { Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import UserPlusIcon from './icons/UserPlusIcon';
import TeacherIcon from './icons/TeacherIcon';
import ClassesIcon from './icons/ClassesIcon';

function QuickActions() {
  const navigate = useNavigate();

  return (
    <div className="dashboard-panel">
      <div className="panel-header">
        <span className="panel-icon">
          <UserPlusIcon />
        </span>
        <div>
          <h5 className="panel-title">إجراءات سريعة</h5>
          <p className="panel-caption">أكثر المهام شيوعاً بين يدي المكوِّن</p>
        </div>
      </div>
      <div style={{ padding: '1.25rem' }}>
        <div className="d-grid gap-3">
          <Button variant="outline-primary" size="lg" onClick={() => navigate('/students')}>
            <UserPlusIcon className="me-2" />
            إضافة طالب جديد
          </Button>
          <Button variant="outline-success" size="lg" onClick={() => navigate('/teachers')}>
            <TeacherIcon className="me-2" />
            إضافة معلم جديد
          </Button>
          <Button variant="outline-primary" size="lg" onClick={() => navigate('/classes')}>
            <ClassesIcon className="me-2" />
            إنشاء فصل جديد
          </Button>
        </div>
      </div>
    </div>
  );
}

export default QuickActions;
