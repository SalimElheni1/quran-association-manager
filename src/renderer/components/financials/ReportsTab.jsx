import React, { useState, useEffect } from 'react';
import { Card, Col, Row, Spinner, Alert, Table } from 'react-bootstrap';
import { useAuth } from '../../contexts/AuthContext';

function ReportsTab() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [activities, setActivities] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [snapshotResult, activitiesResult] = await Promise.all([
          window.electronAPI.getMonthlySnapshot(),
          window.electronAPI.getStatementOfActivities(),
        ]);
        setSnapshot(snapshotResult);
        setActivities(activitiesResult);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch report data:', err);
        setError(err.message || 'فشل في جلب بيانات التقارير.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totalMonthlyRevenue = (activities?.studentFees || 0) + (activities?.cashDonations || 0);
  const totalMonthlyExpenses = (activities?.salaries || 0) + (activities?.expensesByCategory.reduce((acc, exp) => acc + exp.total, 0) || 0);
  const netMonthlyResult = totalMonthlyRevenue - totalMonthlyExpenses;

  const canViewDetailedReport = user?.role === 'Superadmin' || user?.role === 'FinanceManager';

  if (loading) {
    return <div className="text-center"><Spinner animation="border" /></div>;
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  return (
    <div>
      <Row className="mb-4">
        <Col md={4}>
          <Card bg="success" text="white" className="text-center">
            <Card.Body>
              <Card.Title>الدخل (هذا الشهر)</Card.Title>
              <Card.Text className="h3">{snapshot?.totalIncomeThisMonth.toFixed(2) || '0.00'}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card bg="danger" text="white" className="text-center">
            <Card.Body>
              <Card.Title>المصروفات (هذا الشهر)</Card.Title>
              <Card.Text className="h3">{snapshot?.totalExpensesThisMonth.toFixed(2) || '0.00'}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card bg="info" text="white" className="text-center">
            <Card.Body>
              <Card.Title>الرصيد (هذا الشهر)</Card.Title>
              <Card.Text className="h3">{(snapshot?.totalIncomeThisMonth - snapshot?.totalExpensesThisMonth).toFixed(2) || '0.00'}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {canViewDetailedReport ? (
        <>
          <Card className="mb-4">
            <Card.Header as="h4">بيان الأنشطة (هذا الشهر)</Card.Header>
            <Card.Body>
              <h5>الإيرادات</h5>
              <Table striped bordered size="sm">
                <tbody>
                  <tr><td>رسوم دراسية</td><td>{activities?.studentFees.toFixed(2)}</td></tr>
                  <tr><td>تبرعات نقدية</td><td>{activities?.cashDonations.toFixed(2)}</td></tr>
                  <tr className="table-success"><th>مجموع الإيرادات</th><th>{totalMonthlyRevenue.toFixed(2)}</th></tr>
                </tbody>
              </Table>
              <h5 className="mt-4">المصروفات</h5>
              <Table striped bordered size="sm">
                <tbody>
                  <tr><td>رواتب</td><td>{activities?.salaries.toFixed(2)}</td></tr>
                  {activities?.expensesByCategory.map(exp => (
                    <tr key={exp.category}><td>{exp.category}</td><td>{exp.total.toFixed(2)}</td></tr>
                  ))}
                  <tr className="table-danger"><th>مجموع المصروفات</th><th>{totalMonthlyExpenses.toFixed(2)}</th></tr>
                </tbody>
              </Table>
              <hr />
              <div className="d-flex justify-content-between h4">
                <span>النتيجة الصافية:</span>
                <span className={netMonthlyResult >= 0 ? 'text-success' : 'text-danger'}>{netMonthlyResult.toFixed(2)}</span>
              </div>
            </Card.Body>
          </Card>

          <Card>
            <Card.Header as="h4">أحدث المعاملات</Card.Header>
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
                      <td>{tx.amount != null ? tx.amount.toFixed(2) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </>
      ) : (
        <Alert variant="info">
          ليس لديك الصلاحية لعرض التقارير التفصيلية.
        </Alert>
      )}
    </div>
  );
}

export default ReportsTab;
