import React, { useState, useEffect } from 'react';
import { Button, Card, Col, Row, Spinner, Alert } from 'react-bootstrap';
import LineChart from '../charts/LineChart';
import PieChart from '../charts/PieChart';
import BarChart from '../charts/BarChart';


function ReportsTab() {
  const [summary, setSummary] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', variant: 'success' });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [summaryResult, chartResult] = await Promise.all([
          window.electronAPI.getFinancialSummary(),
          window.electronAPI.getChartData()
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

  const showNotification = (message, variant = 'success', duration = 5000) => {
    setNotification({ show: true, message, variant });
    setTimeout(() => setNotification({ show: false, message: '', variant: 'success' }), duration);
  };

  const handleGeneratePdf = async () => {
    try {
      const result = await window.electronAPI.generatePdfReport();
      if (result.success) {
        showNotification(`تم حفظ تقرير PDF بنجاح في: ${result.path}`);
      } else {
        showNotification('فشل في إنشاء تقرير PDF.', 'danger');
      }
    } catch (err) {
      console.error('PDF Generation Error:', err);
      showNotification('حدث خطأ أثناء إنشاء تقرير PDF.', 'danger');
    }
  };

  const handleGenerateExcel = async () => {
    try {
      const result = await window.electronAPI.generateExcelReport();
      if (result.success) {
        showNotification(`تم حفظ تقرير Excel بنجاح في: ${result.path}`);
      } else {
        showNotification('فشل في إنشاء تقرير Excel.', 'danger');
      }
    } catch (err) {
      console.error('Excel Generation Error:', err);
      showNotification('حدث خطأ أثناء إنشاء تقرير Excel.', 'danger');
    }
  };

  if (loading) {
    return <div className="text-center"><Spinner animation="border" /></div>;
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  return (
    <div>
      {notification.show && <Alert variant={notification.variant}>{notification.message}</Alert>}
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

      <Card>
        <Card.Header as="h4">تصدير التقارير</Card.Header>
        <Card.Body className="text-center">
          <p>قم بتصدير ملخص مالي شامل يحتوي على جميع الإيرادات والمصروفات.</p>
          <Button variant="primary" className="me-3" onClick={handleGeneratePdf}>
            تصدير كملف PDF
          </Button>
          <Button variant="success" onClick={handleGenerateExcel}>
            تصدير كملف Excel
          </Button>
        </Card.Body>
      </Card>
    </div>
  );
}

export default ReportsTab;
