import React, { useState, useEffect } from 'react';
import { Card, Col, Row, Spinner, Alert, Table, Form } from 'react-bootstrap';
import { useAuth } from '@renderer/contexts/AuthContext';
import { error as logError } from '@renderer/utils/logger';
import { formatTND } from '@renderer/utils/formatCurrency';

const ARABIC_MONTHS = [
  'جانفي',
  'فيفري',
  'مارس',
  'أفريل',
  'ماي',
  'جوان',
  'جويلية',
  'أوت',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

function ReportsTab() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [activities, setActivities] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); // 0-11
  const [summaryYear, setSummaryYear] = useState(new Date().getFullYear());
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Effect for fetching the annual summary
  useEffect(() => {
    const fetchSummary = async () => {
      setLoadingSummary(true);
      try {
        const summaryResult = await window.electronAPI.getFinancialSummary(summaryYear);
        setSummary(summaryResult);
      } catch (err) {
        logError('Failed to fetch financial summary:', err);
        setError(err.message || 'فشل جلب الملخص المالي.');
      } finally {
        setLoadingSummary(false);
      }
    };
    fetchSummary();
  }, [summaryYear]);

  // Effect for fetching monthly snapshot and activities
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const startDate =
          new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0] + ' 00:00:00';
        const endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59).toISOString();
        const period = { startDate, endDate };

        const [snapshotResult, activitiesResult] = await Promise.all([
          window.electronAPI.getMonthlySnapshot(period),
          window.electronAPI.getStatementOfActivities(period),
        ]);

        setSnapshot(snapshotResult);
        setActivities(activitiesResult);
        if (!error) setError(null); // Do not clear summary error
      } catch (err) {
        logError('Failed to fetch report data:', err);
        setError(err.message || 'فشل جلب بيانات التقارير.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedYear, selectedMonth]);

  const totalMonthlyRevenue = (activities?.studentFees || 0) + (activities?.cashDonations || 0);
  const totalMonthlyExpenses =
    (activities?.salaries || 0) +
    (activities?.expensesByCategory.reduce((acc, exp) => acc + exp.total, 0) || 0);
  const netMonthlyResult = totalMonthlyRevenue - totalMonthlyExpenses;

  const canViewDetailedReport =
    user?.roles?.includes('Superadmin') || user?.roles?.includes('FinanceManager');

  const renderYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear; i >= currentYear - 10; i--) {
      years.push(
        <option key={i} value={i}>
          {i}
        </option>,
      );
    }
    return years;
  };

  const selectedPeriodText = `${ARABIC_MONTHS[selectedMonth]} ${selectedYear}`;

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
        <Card.Header
          as="h4"
          className="bg-dark text-white d-flex justify-content-between align-items-center"
        >
          <span>الملخص المالي لسنة {summaryYear}</span>
          <div style={{ minWidth: '150px' }}>
            <Form.Select
              size="sm"
              value={summaryYear}
              onChange={(e) => setSummaryYear(parseInt(e.target.value, 10))}
            >
              {renderYearOptions()}
            </Form.Select>
          </div>
        </Card.Header>
        <Card.Body>
          {loadingSummary ? (
            <div className="text-center">
              <Spinner animation="border" />
            </div>
          ) : (
            <Row>
              <Col md={4}>
                <Card bg="light">
                  <Card.Body className="text-center">
                    <Card.Title>إجمالي الإيرادات</Card.Title>
                    <Card.Text className="h3 text-success">
                      {summary ? formatTND(summary.totalIncome, 2) : '0,00'} د.ت
                    </Card.Text>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={4}>
                <Card bg="light">
                  <Card.Body className="text-center">
                    <Card.Title>إجمالي المصروفات</Card.Title>
                    <Card.Text className="h3 text-danger">
                      {summary ? formatTND(summary.totalExpenses, 2) : '0,00'} د.ت
                    </Card.Text>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={4}>
                <Card bg="light">
                  <Card.Body className="text-center">
                    <Card.Title>الرصيد الإجمالي</Card.Title>
                    <Card.Text className="h3 text-primary">
                      {summary ? formatTND(summary.balance, 2) : '0,00'} د.ت
                    </Card.Text>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          )}
        </Card.Body>
      </Card>

      <Row className="mb-4">
        <Col md={4}>
          <Card bg="success" text="white" className="text-center">
            <Card.Body>
              <Card.Title>الإيرادات ({selectedPeriodText})</Card.Title>
              <Card.Text className="h3">
                {snapshot ? formatTND(snapshot.totalIncomeThisMonth, 2) : '0,00'} د.ت
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card bg="danger" text="white" className="text-center">
            <Card.Body>
              <Card.Title>المصروفات ({selectedPeriodText})</Card.Title>
              <Card.Text className="h3">
                {snapshot ? formatTND(snapshot.totalExpensesThisMonth, 2) : '0,00'} د.ت
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card bg="info" text="white" className="text-center">
            <Card.Body>
              <Card.Title>الرصيد ({selectedPeriodText})</Card.Title>
              <Card.Text className="h3">
                {snapshot ? formatTND(snapshot.totalIncomeThisMonth - snapshot.totalExpensesThisMonth, 2) : '0,00'} د.ت
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {canViewDetailedReport ? (
        <>
          <Card className="mb-4">
            <Card.Header as="h4" className="d-flex justify-content-between align-items-center">
              <span>كشف الأنشطة ({selectedPeriodText})</span>
              <div style={{ minWidth: '250px' }}>
                <Row>
                  <Col>
                    <Form.Select
                      size="sm"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                    >
                      {ARABIC_MONTHS.map((month, index) => (
                        <option key={index} value={index}>
                          {month}
                        </option>
                      ))}
                    </Form.Select>
                  </Col>
                  <Col>
                    <Form.Select
                      size="sm"
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                    >
                      {renderYearOptions()}
                    </Form.Select>
                  </Col>
                </Row>
              </div>
            </Card.Header>
            <Card.Body>
              <h5>الإيرادات</h5>
              <Table striped bordered size="sm">
                <tbody>
                  <tr>
                    <td>رسوم التسجيل</td>
                    <td>{activities ? formatTND(activities.studentFees, 2) : '0,00'} د.ت</td>
                  </tr>
                  <tr>
                    <td>تبرعات وهبات</td>
                    <td>{activities ? formatTND(activities.cashDonations, 2) : '0,00'} د.ت</td>
                  </tr>
                  <tr className="table-success">
                    <th>مجموع الإيرادات</th>
                    <th>{formatTND(totalMonthlyRevenue, 2)} د.ت</th>
                  </tr>
                </tbody>
              </Table>
              <h5 className="mt-4">المصروفات</h5>
              <Table striped bordered size="sm">
                <tbody>
                  <tr>
                    <td>رواتب وأجور</td>
                    <td>{activities ? formatTND(activities.salaries, 2) : '0,00'} د.ت</td>
                  </tr>
                  {activities?.expensesByCategory.map((exp) => (
                    <tr key={exp.category}>
                      <td>{exp.category}</td>
                      <td>{formatTND(exp.total, 2)} د.ت</td>
                    </tr>
                  ))}
                  <tr className="table-danger">
                    <th>مجموع المصروفات</th>
                    <th>{formatTND(totalMonthlyExpenses, 2)} د.ت</th>
                  </tr>
                </tbody>
              </Table>
              <hr />
              <div className="d-flex justify-content-between h4">
                <span>النتيجة الصافية للشهر:</span>
                <span className={netMonthlyResult >= 0 ? 'text-success' : 'text-danger'}>
                  {formatTND(netMonthlyResult, 2)} د.ت
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
                        {tx.amount != null ? formatTND(tx.amount, 2) + ' د.ت' : '-'}
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
