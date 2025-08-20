import React, { useState, useEffect } from 'react';
import { Row, Col } from 'react-bootstrap';
import { toast } from 'react-toastify';
import StatCard from '../components/StatCard';
import QuickActions from '../components/QuickActions';
import TodaysClasses from '../components/TodaysClasses';
import '../styles/DashboardPage.css';

function DashboardPage() {
  const [stats, setStats] = useState({
    studentCount: null,
    teacherCount: null,
    classCount: null,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const dashboardStats = await window.electronAPI.getDashboardStats();
        setStats(dashboardStats);
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
        toast.error('فشل في تحميل إحصائيات لوحة التحكم.');
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="page-container dashboard-page">
      <div className="page-header">
        <h1>لوحة التحكم الرئيسية</h1>
        <p>نظرة عامة سريعة على نشاط الفرع.</p>
      </div>

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
