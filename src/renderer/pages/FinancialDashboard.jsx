import React, { useState, useEffect, useRef } from 'react';
import { Row, Col, Spinner, Button } from 'react-bootstrap';
import SummaryCard from '@renderer/components/financial/SummaryCard';
import CategoryChart from '@renderer/components/financial/CategoryChart';
import PeriodSelector, { getPresetPeriod } from '@renderer/components/financial/PeriodSelector';
import { useAcademicYear } from '@renderer/hooks/useAcademicYear';
import FinancialExportModal from '@renderer/components/financial/FinancialExportModal';
import { useFinancialSummary } from '@renderer/hooks/useFinancialSummary';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { PERMISSIONS } from '@renderer/utils/permissions';
import ExportIcon from '@renderer/components/icons/ExportIcon';
import RefreshIcon from '@renderer/components/icons/RefreshCwIcon';

function FinancialDashboard() {
  const { hasPermission } = usePermissions();
  // Opens on the current month; a preset (month, year, ...) follows today's date, so a
  // dashboard left open across the end of a month moves on to the new month.
  const [preset, setPreset] = useState('month');
  const [period, setPeriod] = useState(() => getPresetPeriod('month'));
  const [showExportModal, setShowExportModal] = useState(false);

  const { summary, loading, refresh } = useFinancialSummary(period);
  const { startMonth: academicYearStartMonth } = useAcademicYear();

  const latest = useRef({ preset, period, refresh, academicYearStartMonth });
  latest.current = { preset, period, refresh, academicYearStartMonth };

  useEffect(() => {
    // Moves a preset period to today's range. Returns true when it changed (the new period
    // is then fetched by useFinancialSummary).
    const syncPeriodWithToday = () => {
      const { preset: current, period: shown, academicYearStartMonth: startMonth } = latest.current;
      const next = getPresetPeriod(current, new Date(), startMonth);
      if (!next || (next.startDate === shown.startDate && next.endDate === shown.endDate)) {
        return false;
      }
      setPeriod(next);
      return true;
    };
    const refreshForToday = () => {
      if (!syncPeriodWithToday()) latest.current.refresh();
    };

    const handleDataChange = () => refreshForToday();
    const handleTabChange = () => {
      // Refresh when tab becomes visible
      if (document.visibilityState === 'visible') {
        refreshForToday();
      }
    };
    // Catches a new month while the app stays open and focused.
    const dateCheck = setInterval(syncPeriodWithToday, 60 * 1000);

    window.addEventListener('financial-data-changed', handleDataChange);
    window.addEventListener('focus', handleTabChange);
    document.addEventListener('visibilitychange', handleTabChange);

    return () => {
      clearInterval(dateCheck);
      window.removeEventListener('financial-data-changed', handleDataChange);
      window.removeEventListener('focus', handleTabChange);
      document.removeEventListener('visibilitychange', handleTabChange);
    };
  }, []);

  // Refresh when component becomes visible (tab switching)
  useEffect(() => {
    refresh();
  }, []);

  // The academic-year preset follows the configured start month once it has loaded.
  useEffect(() => {
    if (preset === 'academicYear') {
      setPeriod(getPresetPeriod('academicYear', new Date(), academicYearStartMonth));
    }
  }, [academicYearStartMonth]);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>لوحة التحكم المالية</h1>
        <div className="page-header-actions">
          {hasPermission(PERMISSIONS.FINANCIALS_VIEW) && (
            <>
              <Button variant="outline-secondary" onClick={() => refresh()} disabled={loading}>
                <RefreshIcon className="ms-2" /> {loading ? 'جاري التحديث...' : 'تحديث'}
              </Button>
              <Button variant="outline-primary" onClick={() => setShowExportModal(true)}>
                <ExportIcon className="ms-2" /> تصدير التقارير
              </Button>
            </>
          )}
        </div>
      </div>

      <PeriodSelector
        period={period}
        onChange={setPeriod}
        preset={preset}
        onPresetChange={setPreset}
        academicYearStartMonth={academicYearStartMonth}
      />

      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
        </div>
      ) : (
        <>
          <Row>
            <SummaryCard
              title="إجمالي المداخيل"
              value={summary?.totalIncome || 0}
              variant="success"
            />
            <SummaryCard
              title="إجمالي المصاريف"
              value={summary?.totalExpenses || 0}
              variant="danger"
            />
            <SummaryCard
              title="الرصيد الصافي"
              value={(summary?.totalIncome || 0) - (summary?.totalExpenses || 0)}
              variant="primary"
            />
            <SummaryCard
              title="عدد العمليات"
              value={Math.floor(summary?.transactionCount || 0)}
              variant="info"
              suffix=""
            />
          </Row>

          <Row className="mb-4">
            <Col md={6}>
              <CategoryChart
                title="المداخيل حسب نوع الوصل"
                data={summary?.incomeByCategory || []}
                variant="success"
              />
              {summary?.incomeByCategory?.length === 0 && summary?.totalIncome > 0 && (
                <small className="text-muted d-block mt-2 text-center">
                  تنبيه: لا توجد بيانات مفصلة. تأكد من إدخال نوع الوصل للتبرعات النقدية.
                </small>
              )}
            </Col>
            <Col md={6}>
              <CategoryChart
                title="المصاريف حسب الفئة"
                data={summary?.expensesByCategory || []}
                variant="danger"
              />
            </Col>
          </Row>
        </>
      )}
      <FinancialExportModal show={showExportModal} handleClose={() => setShowExportModal(false)} />
    </div>
  );
}

export default FinancialDashboard;
