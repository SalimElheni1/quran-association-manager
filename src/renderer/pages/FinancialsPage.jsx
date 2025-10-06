import React, { useState } from 'react';
import { Tabs, Tab, Container, Card } from 'react-bootstrap';
import FinancialDashboard from './FinancialDashboard';
import IncomePage from './IncomePage';
import ExpensesPage from './ExpensesPage';
import AccountsPage from './AccountsPage';
import InventoryTab from '@renderer/components/financials/InventoryTab';

function FinancialsPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [inventoryTabKey, setInventoryTabKey] = useState(Date.now());

  const handleInventoryUpdate = () => {
    setInventoryTabKey(Date.now());
  };

  return (
    <Container fluid className="p-4">
      <Card>
        <Card.Header as="h2" className="text-center">
          الشؤون المالية
        </Card.Header>
        <Card.Body>
          <Tabs activeKey={activeTab} onSelect={setActiveTab} id="financials-tabs" className="mb-3">
            <Tab eventKey="dashboard" title="📈 لوحة التحكم">
              <FinancialDashboard />
            </Tab>
            <Tab eventKey="income" title="💰 المداخيل">
              <IncomePage />
            </Tab>
            <Tab eventKey="expenses" title="💸 المصاريف">
              <ExpensesPage />
            </Tab>
            <Tab eventKey="accounts" title="📋 إدارة الفئات">
              <AccountsPage />
            </Tab>
            <Tab eventKey="inventory" title="📦 المخزون">
              <InventoryTab key={inventoryTabKey} />
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>
    </Container>
  );
}

export default FinancialsPage;
