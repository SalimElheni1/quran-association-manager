import React, { useState, useEffect } from 'react';
import { Container, Tabs, Tab } from 'react-bootstrap';
import { error as logError } from '@renderer/utils/logger';

import AboutAppTab from '@renderer/components/about/AboutAppTab';
import TechnicalDetailsTab from '@renderer/components/about/TechnicalDetailsTab';
import SupportTab from '@renderer/components/about/SupportTab';

import '@renderer/styles/AboutPage.css';

function AboutPage() {
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await window.electronAPI.getAppVersion();
        setAppVersion(version);
      } catch (error) {
        logError('Failed to fetch app version:', error);
        setAppVersion('N/A');
      }
    };
    fetchVersion();
  }, []);

  const developerInfo = {
    name: 'سليم الهاني',
    email: 'elheni.selim@gmail.com',
    whatsapp: '+21641578854',
    github: 'https://github.com/SalimElheni1',
    linkedin: 'https://www.linkedin.com/in/salimelheni1/',
  };

  const projectInfo = {
    github: 'https://github.com/SalimElheni1/quran-association-manage',
  };

  const bugReportSubject = encodeURIComponent('تقرير خطأ: مدير فروع القرآن الكريم');
  const bugReportBody = encodeURIComponent(`
    يرجى تقديم أكبر قدر ممكن من التفاصيل.
    -----------------------------------------
    خطوات إعادة إنتاج الخطأ:
    1.
    2.
    3.

    السلوك المتوقع:
    ...

    السلوك الفعلي:
    ...

    لقطة شاشة (إن أمكن):
    ...
  `);

  const whatsappMessage = encodeURIComponent(`
    *تقرير خطأ: مدير فروع القرآن الكريم*

    *خطوات إعادة إنتاج الخطأ:*
    1.
    2.
    3.

    *السلوك المتوقع:*
    ...

    *السلوك الفعلي:*
    ...

    *لقطة شاشة (إن أمكن):*
    ...
  `);

  return (
    <Container fluid className="page-container" style={{ textAlign: 'right', direction: 'rtl' }}>
      <div className="page-header">
        <h1>حول التطبيق</h1>
        <p>معلومات عن التطبيق والمطور وكيفية الإبلاغ عن الأخطاء.</p>
      </div>

      <Tabs defaultActiveKey="about" id="about-page-tabs" className="mb-3" variant="pills">
        <Tab eventKey="about" title="عن التطبيق">
          <AboutAppTab />
        </Tab>
        <Tab eventKey="tech" title="تفاصيل تقنية">
          <TechnicalDetailsTab appVersion={appVersion} projectInfo={projectInfo} />
        </Tab>
        <Tab eventKey="support" title="الدعم والمساهمة">
          <SupportTab
            developerInfo={developerInfo}
            bugReportSubject={bugReportSubject}
            bugReportBody={bugReportBody}
            whatsappMessage={whatsappMessage}
          />
        </Tab>
      </Tabs>
    </Container>
  );
}

export default AboutPage;
