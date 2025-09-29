import React, { useState, useEffect } from 'react';
import { Card, ListGroup, Spinner, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { error as logError } from '@renderer/utils/logger';
import AttendanceIcon from './icons/AttendanceIcon';
import ChevronLeftIcon from './icons/ChevronLeftIcon';

function TodaysClasses() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const handleClassClick = (classId) => {
    // Navigate to the attendance page, passing the class ID as a URL parameter.
    navigate(`/attendance?seanceId=${classId}`);
  };

  useEffect(() => {
    const fetchTodaysClasses = async () => {
      try {
        const todaysClasses = await window.electronAPI.getTodaysClasses();
        setClasses(todaysClasses);
      } catch (error) {
        logError("Failed to fetch today's classes:", error);
        toast.error('فشل في تحميل فصول اليوم.');
      } finally {
        setLoading(false);
      }
    };

    fetchTodaysClasses();
  }, []);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="text-center p-4">
          <Spinner animation="border" role="status" />
        </div>
      );
    }

    if (classes.length === 0) {
      return (
        <Alert variant="info" className="m-3 text-center">
          <AttendanceIcon className="me-2" />
          لا توجد فصول مجدولة لهذا اليوم.
        </Alert>
      );
    }

    return (
      <ListGroup variant="flush" className="todays-classes-list">
        {classes.map((cls) => (
          <ListGroup.Item
            key={cls.id}
            className="d-flex justify-content-between align-items-center"
            action // This prop from react-bootstrap adds hover/focus styles
            onClick={() => handleClassClick(cls.id)}
          >
            <div>
              <div className="fw-bold">{cls.name}</div>
              <small className="text-muted">
                {cls.teacher_name ? `المعلم: ${cls.teacher_name}` : 'لم يحدد معلم'}
              </small>
            </div>
            <ChevronLeftIcon className="text-muted" />
          </ListGroup.Item>
        ))}
      </ListGroup>
    );
  };

  return (
    <Card className="h-100">
      <Card.Header as="h5">فصول اليوم</Card.Header>
      {renderContent()}
    </Card>
  );
}

export default TodaysClasses;
