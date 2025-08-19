import React, { useState, useEffect } from 'react';
import { Card, Col, Row, Spinner, Alert } from 'react-bootstrap';
import LineChart from '../charts/LineChart';
import PieChart from '../charts/PieChart';
import BarChart from '../charts/BarChart';

function ReportsTab() {
  const [summary, setSummary] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [summaryResult, chartResult] = await Promise.all([
          window.electronAPI.getFinancialSummary(),
          window.electronAPI.getChartData(),
        ]);
        setSummary(summaryResult);
        setChartData(chartResult);
      } catch (err) {
        console.error('Failed to fetch report data:', err);
        setError('فشل في جلب بيانات التقارير.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

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
      <Row className="mb-4">
        <Col md={4}>
          <Card bg="success" text="white" className="text-center">
            <Card.Body>
              <Card.Title>إجمالي الدخل</Card.Title>
              <Card.Text className="h3">{summary?.totalIncome.toFixed(2) || '0.00'}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card bg="danger" text="white" className="text-center">
            <Card.Body>
              <Card.Title>إجمالي المصروفات</Card.Title>
              <Card.Text className="h3">{summary?.totalExpenses.toFixed(2) || '0.00'}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card bg="info" text="white" className="text-center">
            <Card.Body>
              <Card.Title>الرصيد</Card.Title>
              <Card.Text className="h3">{summary?.balance.toFixed(2) || '0.00'}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header as="h5">الدخل مقابل المصروفات (شهرياً)</Card.Header>
            <Card.Body>
              {chartData?.timeSeriesData && <LineChart data={chartData.timeSeriesData} />}
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header as="h5">تصنيف المصروفات</Card.Header>
            <Card.Body>
              {chartData?.expenseCategoryData && <PieChart data={chartData.expenseCategoryData} />}
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <Row>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header as="h5">مصادر الدخل</Card.Header>
            <Card.Body>
              {chartData?.incomeSourceData && <BarChart data={chartData.incomeSourceData} />}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default ReportsTab;
