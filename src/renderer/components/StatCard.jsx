import React from 'react';
import { Card, Col, Spinner } from 'react-bootstrap';
import UserGraduateIcon from './icons/UserGraduateIcon';
import TeacherIcon from './icons/TeacherIcon';
import ClassesIcon from './icons/ClassesIcon';

const StatIcon = ({ icon }) => {
  switch (icon) {
    case 'user-graduate':
      return <UserGraduateIcon />;
    case 'chalkboard-teacher':
      return <TeacherIcon />;
    case 'school':
      return <ClassesIcon />;
    default:
      return null;
  }
};

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
            <StatIcon icon={icon} />
          </div>
        </Card.Body>
      </Card>
    </Col>
  );
}

export default StatCard;
