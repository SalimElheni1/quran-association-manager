import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { error as logError } from '@renderer/utils/logger';

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
    name: 'Salim Elheni',
    email: 'elheni.selim@gmail.com',
    whatsapp: '+21641578854',
  };

  const appDescription = 'Desktop application for managing Quran association branches.';

  const bugReportSubject = encodeURIComponent('Bug Report: Quran Branch Manager');
  const bugReportBody = encodeURIComponent(`
    Please provide as much detail as possible.
    -----------------------------------------
    Steps to reproduce the bug:
    1.
    2.
    3.

    Expected behavior:
    ...

    Actual behavior:
    ...

    Screenshot (if applicable):
    ...
  `);

  const whatsappMessage = encodeURIComponent(`
    *Bug Report: Quran Branch Manager*

    *Steps to reproduce the bug:*
    1.
    2.
    3.

    *Expected behavior:*
    ...

    *Actual behavior:*
    ...

    *Screenshot (if applicable):*
    ...
  `);

  return (
    <Container fluid className="page-container">
      <div className="page-header">
        <h1>حول التطبيق</h1>
        <p>معلومات عن التطبيق والمطور وكيفية الإبلاغ عن الأخطاء.</p>
      </div>

      <Row>
        <Col md={6} className="mb-4">
          <Card>
            <Card.Header as="h5">
              <i className="fas fa-info-circle me-2"></i>معلومات التطبيق
            </Card.Header>
            <Card.Body>
              <Card.Title>Quran Branch Manager</Card.Title>
              <Card.Text>{appDescription}</Card.Text>
              <p>
                <strong>الإصدار:</strong> {appVersion}
              </p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6} className="mb-4">
          <Card>
            <Card.Header as="h5">
              <i className="fas fa-user-tie me-2"></i>معلومات المطور
            </Card.Header>
            <Card.Body>
              <Card.Title>{developerInfo.name}</Card.Title>
              <p>
                <i className="fas fa-envelope me-2"></i>
                <a href={`mailto:${developerInfo.email}`}>{developerInfo.email}</a>
              </p>
              <p>
                <i className="fab fa-whatsapp me-2"></i>
                <a href={`https://wa.me/${developerInfo.whatsapp.replace('+', '')}`} target="_blank" rel="noopener noreferrer">
                  {developerInfo.whatsapp}
                </a>
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col>
          <Card>
            <Card.Header as="h5">
              <i className="fas fa-bug me-2"></i>الإبلاغ عن خطأ
            </Card.Header>
            <Card.Body>
              <Card.Text>
                إذا واجهت أي مشكلة أو خطأ في التطبيق، يرجى إبلاغنا للمساعدة في تحسينه. اتبع الخطوات التالية:
              </Card.Text>
              <ul>
                <li>
                  <strong>وصف المشكلة:</strong> اشرح الخطوات التي أدت إلى ظهور الخطأ.
                </li>
                <li>
                  <strong>النتيجة المتوقعة:</strong> ما الذي كنت تتوقع حدوثه؟
                </li>
                <li>
                  <strong>النتيجة الفعلية:</strong> ما الذي حدث بالفعل؟
                </li>
                <li>
                  <strong>لقطة شاشة:</strong> إذا أمكن، قم بإرفاق لقطة شاشة للخطأ.
                </li>
              </ul>
              <hr />
              <p>يمكنك إرسال تقرير الخطأ عبر البريد الإلكتروني أو واتساب:</p>
              <Button
                variant="primary"
                href={`mailto:${developerInfo.email}?subject=${bugReportSubject}&body=${bugReportBody}`}
                className="me-2"
              >
                <i className="fas fa-envelope me-2"></i>إرسال عبر البريد الإلكتروني
              </Button>
              <Button
                variant="success"
                href={`https://wa.me/${developerInfo.whatsapp.replace('+', '')}?text=${whatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fab fa-whatsapp me-2"></i>إرسال عبر واتساب
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default AboutPage;
