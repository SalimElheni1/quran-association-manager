import React, { useState, useEffect } from 'react';
import { Card, Col, Row, Spinner, Alert } from 'react-bootstrap';

function ReportsTab() {
  const [summary, setSummary] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [summaryResult, snapshotResult] = await Promise.all([
          window.electronAPI.getFinancialSummary(),
          window.electronAPI.getMonthlySnapshot(),
        ]);
        setSummary(summaryResult);
        setSnapshot(snapshotResult);
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
              <Card.Title>إجمالي الدخل (الكلي)</Card.Title>
              <Card.Text className="h3">{summary?.totalIncome.toFixed(2) || '0.00'}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card bg="danger" text="white" className="text-center">
            <Card.Body>
              <Card.Title>إجمالي المصروفات (الكلي)</Card.Title>
              <Card.Text className="h3">{summary?.totalExpenses.toFixed(2) || '0.00'}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card bg="info" text="white" className="text-center">
            <Card.Body>
              <Card.Title>الرصيد (الكلي)</Card.Title>
              <Card.Text className="h3">{summary?.balance.toFixed(2) || '0.00'}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card>
        <Card.Header as="h4">ملخص هذا الشهر</Card.Header>
        <Card.Body>
          <Row>
            <Col md={3} className="text-center">
              <h5>الدخل الشهري</h5>
              <p className="h4 text-success">{snapshot?.totalIncomeThisMonth.toFixed(2) || '0.00'}</p>
            </Col>
            <Col md={3} className="text-center">
              <h5>المصروفات الشهرية</h5>
              <p className="h4 text-danger">{snapshot?.totalExpensesThisMonth.toFixed(2) || '0.00'}</p>
            </Col>
            <Col md={3} className="text-center">
              <h5>عدد الدفعات المستلمة</h5>
              <p className="h4">{snapshot?.paymentsThisMonth || 0}</p>
            </Col>
            <Col md={3} className="text-center">
              <h5>أكبر مصروف</h5>
              <p className="h4">{snapshot?.largestExpenseThisMonth.toFixed(2) || '0.00'}</p>
            </Col>
          </Row>
        </Card.Body>
      </Card>
    </div>
  );
}

export default ReportsTab;
