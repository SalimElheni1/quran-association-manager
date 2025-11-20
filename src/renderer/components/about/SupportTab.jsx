import React from 'react';
import { Card, Button, Row, Col } from 'react-bootstrap';
import UserTieIcon from '../icons/UserTieIcon';
import EnvelopeIcon from '../icons/EnvelopeIcon';
import WhatsappIcon from '../icons/WhatsappIcon';
import GithubIcon from '../icons/GithubIcon';
import LinkedinIcon from '../icons/LinkedinIcon';
import BugIcon from '../icons/BugIcon';
import HeartIcon from '../icons/HeartIcon';

const SupportTab = ({ developerInfo, bugReportSubject, bugReportBody, whatsappMessage }) => {
  return (
    <Row>
      <Col md={6} className="mb-4">
        <Card>
          <Card.Header as="h5">
            <UserTieIcon className="me-2" />
            تواصل مع المطور
          </Card.Header>
          <Card.Body>
            <Card.Title>{developerInfo.name}</Card.Title>
            <p>
              <EnvelopeIcon className="me-2" />
              <a href={`mailto:${developerInfo.email}`}>{developerInfo.email}</a>
            </p>
            <p>
              <WhatsappIcon className="me-2" />
              <a
                href={`https://wa.me/${developerInfo.whatsapp.replace('+', '')}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {developerInfo.whatsapp}
              </a>
            </p>
            <p>
              <GithubIcon className="me-2" />
              <a href={developerInfo.github} target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </p>
            <p>
              <LinkedinIcon className="me-2" />
              <a href={developerInfo.linkedin} target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>
            </p>
          </Card.Body>
        </Card>
      </Col>
      <Col md={6} className="mb-4">
        <Card>
          <Card.Header as="h5">
            <BugIcon className="me-2" />
            الإبلاغ عن خطأ
          </Card.Header>
          <Card.Body>
            <Card.Text>
              إذا واجهت أي مشكلة أو خطأ في التطبيق، يرجى إبلاغنا للمساعدة في تحسينه. اتبع الخطوات
              التالية:
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
              <EnvelopeIcon className="me-2" />
              إرسال عبر البريد الإلكتروني
            </Button>
            <Button
              variant="success"
              href={`https://wa.me/${developerInfo.whatsapp.replace('+', '')}?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="me-2"
            >
              <WhatsappIcon className="me-2" />
              إرسال عبر واتساب
            </Button>
          </Card.Body>
        </Card>
      </Col>
      <Col md={12} className="mb-4">
        <Card>
          <Card.Header as="h5">
            <HeartIcon className="me-2" />
            شكر وتقدير
          </Card.Header>
          <Card.Body>
            <Card.Text>نشكر كل من ساهم في دعم هذا المشروع.</Card.Text>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
};

export default SupportTab;
