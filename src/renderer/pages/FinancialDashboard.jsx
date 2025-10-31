import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Spinner, Button } from 'react-bootstrap';
import SummaryCard from '@renderer/components/financial/SummaryCard';
import CategoryChart from '@renderer/components/financial/CategoryChart';
import PeriodSelector from '@renderer/components/financial/PeriodSelector';
import TransactionTable from '@renderer/components/financial/TransactionTable';
import FinancialExportModal from '@renderer/components/financial/FinancialExportModal';
import { useFinancialSummary } from '@renderer/hooks/useFinancialSummary';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { PERMISSIONS } from '@renderer/utils/permissions';
import ExportIcon from '@renderer/components/icons/ExportIcon';

function FinancialDashboard() {
  const { hasPermission } = usePermissions();
  const today = new Date();
  const [period, setPeriod] = useState({
    startDate: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0],
  });
  const [showExportModal, setShowExportModal] = useState(false);

  const { summary, loading, refresh } = useFinancialSummary(period);

  useEffect(() => {
    const handleDataChange = () => refresh();
    window.addEventListener('financial-data-changed', handleDataChange);
    return () => window.removeEventListener('financial-data-changed', handleDataChange);
  }, [refresh]);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>لوحة التحكم المالية</h1>
        <div className="page-header-actions">
        {hasPermission(PERMISSIONS.FINANCIAL_VIEW) && (
          <Button variant="outline-primary" onClick={() => setShowExportModal(true)}>
            <ExportIcon className="ms-2" /> تصدير التقارير
          </Button>
        )}
        </div>
      </div>

      <PeriodSelector period={period} onChange={setPeriod} />

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
      <FinancialExportModal
        show={showExportModal}
        handleClose={() => setShowExportModal(false)}
      />
    </div>
  );
}

export default FinancialDashboard;