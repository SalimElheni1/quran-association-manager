import React from 'react';
import { Tabs, Tab, Container, Card } from 'react-bootstrap';
import ExpensesTab from '../components/financials/ExpensesTab';
import DonationsTab from '../components/financials/DonationsTab';
import SalariesTab from '../components/financials/SalariesTab';
import PaymentsTab from '../components/financials/PaymentsTab';
import ReportsTab from '../components/financials/ReportsTab';

function FinancialsPage() {
  return (
    <Container fluid className="p-4">
      <Card>
        <Card.Header as="h2" className="text-center">
          الشؤون المالية
        </Card.Header>
        <Card.Body>
          <Tabs defaultActiveKey="reports" id="financials-tabs" className="mb-3" fill>
            <Tab eventKey="reports" title="تقارير وإحصائيات">
              <ReportsTab />
            </Tab>
            <Tab eventKey="payments" title="الرسوم الدراسية">
              <PaymentsTab />
            </Tab>
            <Tab eventKey="salaries" title="الرواتب والأجور">
              <SalariesTab />
            </Tab>
            <Tab eventKey="donations" title="التبرعات والهبات">
              <DonationsTab />
            </Tab>
            <Tab eventKey="expenses" title="المصاريف والنثريات">
              <ExpensesTab />
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>
    </Container>
  );
}

export default FinancialsPage;
