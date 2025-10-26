import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Spinner } from 'react-bootstrap';
import SummaryCard from '@renderer/components/financial/SummaryCard';
import CategoryChart from '@renderer/components/financial/CategoryChart';
import PeriodSelector from '@renderer/components/financial/PeriodSelector';
import TransactionTable from '@renderer/components/financial/TransactionTable';
import { useFinancialSummary } from '@renderer/hooks/useFinancialSummary';

/**
 * FinancialDashboard - Main financial overview page
 */
function FinancialDashboard() {
  const today = new Date();
  const [period, setPeriod] = useState({
    startDate: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0],
  });

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
        <p>نظرة شاملة على الوضع المالي للفرع</p>
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

          {/* <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">آخر العمليات</h5>
            </Card.Header>
            <Card.Body>
              {summary?.recentTransactions?.length > 0 ? (
                <TransactionTable
                  transactions={summary.recentTransactions}
                  loading={false}
                  compact={true}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onPrint={() => {}}
                />
              ) : (
                <p className="text-muted text-center">لا توجد عمليات في هذه الفترة</p>
              )}
            </Card.Body>
          </Card> */}
        </>
      )}
    </div>
  );
}

export default FinancialDashboard;
