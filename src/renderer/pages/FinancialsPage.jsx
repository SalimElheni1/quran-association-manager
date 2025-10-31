import React, { useState } from 'react';
import { useEffect } from 'react';
import { Tabs, Tab, Container, Card } from 'react-bootstrap';
import FinancialDashboard from './FinancialDashboard';
import IncomePage from './IncomePage';
import StudentFeesTab from '@renderer/components/financials/StudentFeesTab';
import ExpensesPage from './ExpensesPage';
import AccountsPage from './AccountsPage';
import InventoryTab from '@renderer/components/financials/InventoryTab';

function FinancialsPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [inventoryTabKey, setInventoryTabKey] = useState(Date.now());

  const handleInventoryUpdate = () => {
    setInventoryTabKey(Date.now());
  };

  // Listen for import completion to refresh inventory tab when inventory sheet is imported
  useEffect(() => {
    const domHandler = (e) => {
      try {
        const sheets = e?.detail?.sheets || [];
        if (sheets.includes('المخزون')) {
          handleInventoryUpdate();
        }
      } catch (err) {
        // ignore
        // console.error('Error handling DOM import-completed in FinancialsPage:', err);
      }
    };

    let unsubscribe = null;
    try {
      if (window.electronAPI && typeof window.electronAPI.onImportCompleted === 'function') {
        unsubscribe = window.electronAPI.onImportCompleted((payload) => {
          try {
            const sheets = payload?.sheets || [];
            if (sheets.includes('المخزون')) {
              handleInventoryUpdate();
            }
          } catch (err) {
            // ignore
          }
        });
      }
    } catch (err) {
      // ignore
    }

    window.addEventListener('app:import-completed', domHandler);
    return () => {
      window.removeEventListener('app:import-completed', domHandler);
      try {
        if (typeof unsubscribe === 'function') unsubscribe();
      } catch (e) {
        // ignore
      }
    };
  }, []);

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
            <Tab eventKey="student-fees" title="👨‍🎓 رسوم الطلاب">
              <StudentFeesTab />
            </Tab>
            <Tab eventKey="expenses" title="💸 المصاريف">
              <ExpensesPage />
            </Tab>
            <Tab eventKey="accounts" title="📋 إدارة الفئات">
              <AccountsPage />
            </Tab>
            <Tab eventKey="inventory" title="📦 الجرد">
              <InventoryTab key={inventoryTabKey} />
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>
    </Container>
  );
}

export default FinancialsPage;
