import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Alert, Button, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import StatCard from '../components/StatCard';
import QuickActions from '../components/QuickActions';
import TodaysClasses from '../components/TodaysClasses';
import '../styles/DashboardPage.css';

function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    studentCount: null,
    teacherCount: null,
    classCount: null,
  });
  const [backupReminder, setBackupReminder] = useState({ show: false, message: '' });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Fetch stats and backup status in parallel
        const [dashboardStats, reminderStatus] = await Promise.all([
          window.electronAPI.getDashboardStats(),
          window.electronAPI.getBackupReminderStatus(),
        ]);

        setStats(dashboardStats);

        if (reminderStatus.showReminder) {
          const days = reminderStatus.daysSinceLastBackup;
          const message =
            days === Infinity
              ? 'لم يتم العثور على نسخة احتياطية سابقة. يُرجى إنشاء واحدة الآن لحماية بياناتك.'
              : `لم تقم بإنشاء نسخة احتياطية لقاعدة البيانات منذ أكثر من ${days} أيام.`;
          setBackupReminder({ show: true, message });
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        toast.error('فشل في تحميل بيانات لوحة التحكم.');
      }
    };

    fetchDashboardData();
  }, []);

  const handleGoToBackupPage = () => {
    navigate('/settings', { state: { defaultTab: 'backup' } });
  };

  return (
    <div className="page-container dashboard-page">
      <div className="page-header">
        <h1>لوحة التحكم الرئيسية</h1>
        <p>نظرة عامة سريعة على نشاط الفرع.</p>
      </div>

      {backupReminder.show && (
        <Alert
          variant="warning"
          onClose={() => setBackupReminder({ show: false, message: '' })}
          dismissible
          className="d-flex justify-content-between align-items-center"
        >
          <div>
            <i className="fas fa-exclamation-triangle me-2"></i>
            {backupReminder.message}
          </div>
          <Button variant="outline-dark" size="sm" onClick={handleGoToBackupPage}>
            الانتقال إلى صفحة النسخ الاحتياطي
          </Button>
        </Alert>
      )}

      {/* Section for Key Performance Indicators (KPIs) */}
      <Row className="mb-4">
        <StatCard
          title="الطلاب النشطون"
          value={stats.studentCount}
          icon="fas fa-user-graduate"
          variant="primary"
        />
        <StatCard
          title="المعلمون"
          value={stats.teacherCount}
          icon="fas fa-chalkboard-teacher"
          variant="success"
        />
        <StatCard
          title="الفصول النشطة"
          value={stats.classCount}
          icon="fas fa-school"
          variant="info"
        />
      </Row>

      {/* Section for Today's Activities and Quick Actions */}
      <Row>
        <Col lg={8} className="mb-4">
          <TodaysClasses />
        </Col>
        <Col lg={4} className="mb-4">
          <QuickActions />
        </Col>
      </Row>
    </div>
  );
}

export default DashboardPage;
