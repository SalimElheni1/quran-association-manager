import React, { useState } from 'react';
import { Tabs, Tab, Container, Card } from 'react-bootstrap';
import ExpensesTab from '@renderer/components/financials/ExpensesTab';
import DonationsTab from '@renderer/components/financials/DonationsTab';
import SalariesTab from '@renderer/components/financials/SalariesTab';
import PaymentsTab from '@renderer/components/financials/PaymentsTab';
import ReportsTab from '@renderer/components/financials/ReportsTab';
import InventoryTab from '@renderer/components/financials/InventoryTab';

function FinancialsPage() {
  const [activeTab, setActiveTab] = useState('inventory');
  const [reportsTabKey, setReportsTabKey] = useState(Date.now());

  const handleTabSelect = (key) => {
    setActiveTab(key);
    // If the reports tab is selected, give it a new key to force a remount
    if (key === 'reports') {
      setReportsTabKey(Date.now());
    }
  };

  return (
    <Container fluid className="p-4">
      <Card>
        <Card.Header as="h2" className="text-center">
          الشؤون المالية
        </Card.Header>
        <Card.Body>
          <Tabs activeKey={activeTab} onSelect={handleTabSelect} id="financials-tabs" className="mb-3" fill>
            <Tab eventKey="reports" title="تقارير وإحصائيات">
              <ReportsTab key={reportsTabKey} />
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
            <Tab eventKey="inventory" title="المخزون">
              <InventoryTab />
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
