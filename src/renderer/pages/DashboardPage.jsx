import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Alert, Button, Spinner } from 'react-bootstrap';
import { Modal } from 'react-bootstrap';
import { toast } from 'react-toastify';
import StatCard from '@renderer/components/StatCard';
import QuickActions from '@renderer/components/QuickActions';
import TodaysClasses from '@renderer/components/TodaysClasses';
import '@renderer/styles/DashboardPage.css';
import { error as logError } from '@renderer/utils/logger';
import { useAuth } from '@renderer/contexts/AuthContext';
import ExclamationTriangleIcon from '@renderer/components/icons/ExclamationTriangleIcon';

function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    studentCount: null,
    teacherCount: null,
    classCount: null,
  });
  const [backupReminder, setBackupReminder] = useState({ show: false, message: '' });
  const [showGuideModal, setShowGuideModal] = useState(false);
  const { token } = useAuth();

  const handleOpenGuideModal = () => setShowGuideModal(true);
  const handleCloseGuideModal = () => setShowGuideModal(false);

  const startGuideFrom = async (option) => {
    try {
      const profile = await window.electronAPI.getProfile({ token });
      if (!profile || !profile.id) return;
      if (option === 'continue') {
        // leave current_step as is and enable guide
        await window.electronAPI.updateUserGuide(profile.id, { need_guide: 1 });
        // close modal and notify renderer to open guide without reload
        setShowGuideModal(false);
        window.dispatchEvent(
          new CustomEvent('onboarding:open', { detail: { action: 'open', profile } }),
        );
      } else if (option === 'begin') {
        await window.electronAPI.updateUserGuide(profile.id, { need_guide: 1, current_step: 0 });
        // close modal and open guide at step 0
        setShowGuideModal(false);
        window.dispatchEvent(
          new CustomEvent('onboarding:open', {
            detail: { action: 'open-begin', profile, current_step: 0 },
          }),
        );
      }
    } catch (e) {
      // ignore
    }
  };

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
        logError('Failed to fetch dashboard data:', error);
        toast.error('فشل في تحميل بيانات لوحة التحكم.');
      }
    };

    fetchDashboardData();
  }, []);

  const handleGoToBackupPage = () => {
    navigate('/settings', { state: { defaultTab: 'backup' } });
  };

  return (
    <>
      <div className="page-container dashboard-page">
        <div className="page-header">
          <h1>لوحة التحكم الرئيسية</h1>
          <p>نظرة عامة سريعة على نشاط الفرع.</p>
          <div>
            <Button
              variant="outline-primary"
              size="sm"
              onClick={handleOpenGuideModal}
              className="me-2"
            >
              تشغيل دليل التعريف
            </Button>
          </div>
        </div>

        {backupReminder.show && (
          <Alert
            variant="warning"
            onClose={() => setBackupReminder({ show: false, message: '' })}
            dismissible
            className="d-flex justify-content-between align-items-center"
          >
            <div>
              <ExclamationTriangleIcon className="me-2" />
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
            icon="user-graduate"
            variant="primary"
          />
          <StatCard
            title="المعلمون"
            value={stats.teacherCount}
            icon="chalkboard-teacher"
            variant="success"
          />
          <StatCard title="الفصول النشطة" value={stats.classCount} icon="school" variant="info" />
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

      <Modal show={showGuideModal} onHide={handleCloseGuideModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>تشغيل دليل الإعداد</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>هل تريد متابعة الدليل من آخر خطوة وصلت إليها، أم البدء من البداية؟</p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => {
              handleCloseGuideModal();
            }}
          >
            إلغاء
          </Button>
          <Button
            variant="outline-primary"
            onClick={() => {
              startGuideFrom('continue');
            }}
          >
            متابعة
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              startGuideFrom('begin');
            }}
          >
            البدء من البداية
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default DashboardPage;
