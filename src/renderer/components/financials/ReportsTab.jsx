import React, { useState, useEffect } from 'react';
import { Card, Col, Row, Spinner, Alert, Table } from 'react-bootstrap';
import { useAuth } from '@renderer/contexts/AuthContext';
import { error as logError } from '@renderer/utils/logger';

function ReportsTab() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [activities, setActivities] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [summaryResult, snapshotResult, activitiesResult] = await Promise.all([
          window.electronAPI.getFinancialSummary(),
          window.electronAPI.getMonthlySnapshot(),
          window.electronAPI.getStatementOfActivities(),
        ]);
        setSummary(summaryResult);
        setSnapshot(snapshotResult);
        setActivities(activitiesResult);
        setError(null);
      } catch (err) {
        logError('Failed to fetch report data:', err);
        setError(err.message || 'فشل جلب بيانات التقارير.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totalMonthlyRevenue = (activities?.studentFees || 0) + (activities?.cashDonations || 0);
  const totalMonthlyExpenses =
    (activities?.salaries || 0) +
    (activities?.expensesByCategory.reduce((acc, exp) => acc + exp.total, 0) || 0);
  const netMonthlyResult = totalMonthlyRevenue - totalMonthlyExpenses;

  const canViewDetailedReport = user?.role === 'Superadmin' || user?.role === 'FinanceManager';

  if (loading) {
    return (
      <div className="text-center">
        <Spinner animation="border" />
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  return (
    <div>
      <Card className="mb-4">
        <Card.Header as="h4" className="bg-dark text-white">
          الملخص المالي العام
        </Card.Header>
        <Card.Body>
          <Row>
            <Col md={4}>
              <Card bg="light">
                <Card.Body className="text-center">
                  <Card.Title>إجمالي الإيرادات</Card.Title>
                  <Card.Text className="h3 text-success">
                    {summary?.totalIncome.toFixed(2) || '0.00'}
                  </Card.Text>
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card bg="light">
                <Card.Body className="text-center">
                  <Card.Title>إجمالي المصروفات</Card.Title>
                  <Card.Text className="h3 text-danger">
                    {summary?.totalExpenses.toFixed(2) || '0.00'}
                  </Card.Text>
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card bg="light">
                <Card.Body className="text-center">
                  <Card.Title>الرصيد الإجمالي</Card.Title>
                  <Card.Text className="h3 text-primary">
                    {summary?.balance.toFixed(2) || '0.00'}
                  </Card.Text>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Row className="mb-4">
        <Col md={4}>
          <Card bg="success" text="white" className="text-center">
            <Card.Body>
              <Card.Title>الإيرادات (الشهر الحالي)</Card.Title>
              <Card.Text className="h3">
                {snapshot?.totalIncomeThisMonth.toFixed(2) || '0.00'}
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card bg="danger" text="white" className="text-center">
            <Card.Body>
              <Card.Title>المصروفات (الشهر الحالي)</Card.Title>
              <Card.Text className="h3">
                {snapshot?.totalExpensesThisMonth.toFixed(2) || '0.00'}
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card bg="info" text="white" className="text-center">
            <Card.Body>
              <Card.Title>الرصيد (الشهر الحالي)</Card.Title>
              <Card.Text className="h3">
                {(snapshot?.totalIncomeThisMonth - snapshot?.totalExpensesThisMonth).toFixed(2) ||
                  '0.00'}
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {canViewDetailedReport ? (
        <>
          <Card className="mb-4">
            <Card.Header as="h4">كشف الأنشطة (الشهر الحالي)</Card.Header>
            <Card.Body>
              <h5>الإيرادات</h5>
              <Table striped bordered size="sm">
                <tbody>
                  <tr>
                    <td>رسوم التسجيل</td>
                    <td>{activities?.studentFees.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td>تبرعات وهبات</td>
                    <td>{activities?.cashDonations.toFixed(2)}</td>
                  </tr>
                  <tr className="table-success">
                    <th>مجموع الإيرادات</th>
                    <th>{totalMonthlyRevenue.toFixed(2)}</th>
                  </tr>
                </tbody>
              </Table>
              <h5 className="mt-4">المصروفات</h5>
              <Table striped bordered size="sm">
                <tbody>
                  <tr>
                    <td>رواتب وأجور</td>
                    <td>{activities?.salaries.toFixed(2)}</td>
                  </tr>
                  {activities?.expensesByCategory.map((exp) => (
                    <tr key={exp.category}>
                      <td>{exp.category}</td>
                      <td>{exp.total.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="table-danger">
                    <th>مجموع المصروفات</th>
                    <th>{totalMonthlyExpenses.toFixed(2)}</th>
                  </tr>
                </tbody>
              </Table>
              <hr />
              <div className="d-flex justify-content-between h4">
                <span>النتيجة الصافية للشهر:</span>
                <span className={netMonthlyResult >= 0 ? 'text-success' : 'text-danger'}>
                  {netMonthlyResult.toFixed(2)}
                </span>
              </div>
            </Card.Body>
          </Card>

          <Card>
            <Card.Header as="h4">آخر العمليات المالية</Card.Header>
            <Card.Body>
              <Table striped bordered hover responsive size="sm">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>النوع</th>
                    <th>التفاصيل</th>
                    <th>المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {activities?.recentTransactions.map((tx, index) => (
                    <tr key={index}>
                      <td>{new Date(tx.date).toLocaleDateString()}</td>
                      <td>{tx.type}</td>
                      <td>{tx.details}</td>
                      <td className="text-start">
                        {tx.amount != null ? tx.amount.toFixed(2) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </>
      ) : (
        <Alert variant="info">لا تملك الصلاحيات اللازمة لعرض التقارير المفصلة.</Alert>
      )}
    </div>
  );
}

export default ReportsTab;
