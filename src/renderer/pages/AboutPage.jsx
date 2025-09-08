import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, ListGroup } from 'react-bootstrap';
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

      <Row>
        <Col lg={8} className="mb-4">
          <Card className="h-100">
            <Card.Header as="h5">
              <i className="fas fa-info-circle me-2"></i>عن التطبيق
            </Card.Header>
            <Card.Body>
              <Card.Text>
                مدير فروع القرآن الكريم هو تطبيق سطح مكتب حديث ومتعدد المنصات، مصمم خصيصاً لتنظيم وإدارة العمليات الإدارية للجمعيات القرآنية. تم تطويره باستخدام تقنيات Electron و React لتوفير نظام آمن وسهل الاستخدام يعمل بدون اتصال بالإنترنت.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={4} className="mb-4">
          <Card className="h-100">
            <Card.Header as="h5">
              <i className="fas fa-bullseye me-2"></i>الرؤية والرسالة
            </Card.Header>
            <Card.Body>
              <Card.Text>
                <strong>رؤيتنا:</strong> تحويل الإدارة الورقية التقليدية للجمعيات القرآنية إلى نظام رقمي متكامل يسهل إدارة الطلاب والمعلمين والفصول والشؤون المالية.
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="mb-4">
        <Card.Header as="h5">
          <i className="fas fa-star me-2"></i>المميزات الرئيسية
        </Card.Header>
        <Card.Body>
          <ListGroup variant="flush">
            <ListGroup.Item><strong>إدارة الطلاب:</strong> تسجيل الطلاب، تتبع مستوى الحفظ والتلاوة، إدارة المعلومات الشخصية وبيانات الاتصال.</ListGroup.Item>
            <ListGroup.Item><strong>إدارة المعلمين والفصول:</strong> إدارة ملفات المعلمين، إنشاء جداول الحصص، توزيع الطلاب والمعلمين على الفصول.</ListGroup.Item>
            <ListGroup.Item><strong>نظام الحضور والغياب:</strong> تسجيل حضور الطلاب، متابعة الانتظام، إنشاء تقارير مفصلة.</ListGroup.Item>
            <ListGroup.Item><strong>الإدارة المالية:</strong> تتبع رسوم الطلاب، رواتب المعلمين، التبرعات العينية والنقدية، والمصاريف العامة.</ListGroup.Item>
            <ListGroup.Item><strong>نظام التقارير الشامل:</strong> إنشاء تقارير عن مستوى الطلاب، الحضور، والوضع المالي بصيغة PDF و Excel.</ListGroup.Item>
            <ListGroup.Item><strong>التحكم في الصلاحيات:</strong> نظام دخول آمن مع صلاحيات متعددة.</ListGroup.Item>
            <ListGroup.Item><strong>العمل بدون إنترنت:</strong> التطبيق يعمل بشكل كامل بدون اتصال بالإنترنت مع تخزين البيانات محلياً وبشكل آمن.</ListGroup.Item>
            <ListGroup.Item><strong>دعم كامل للغة العربية:</strong> واجهة كاملة باللغة العربية مع دعم الكتابة من اليمين إلى اليسار.</ListGroup.Item>
            <ListGroup.Item><strong>النسخ الاحتياطي والتصدير:</strong> أدوات لعمل نسخ احتياطية لقاعدة البيانات وتصدير البيانات.</ListGroup.Item>
          </ListGroup>
        </Card.Body>
      </Card>

      <Row>
        <Col md={6} className="mb-4">
           <Card>
            <Card.Header as="h5">
              <i className="fas fa-cogs me-2"></i>تقنيات التطوير
            </Card.Header>
            <Card.Body>
              <p><strong>الواجهة الأمامية:</strong> React مع React Bootstrap</p>
              <p><strong>النظام الخلفي:</strong> Electron.js</p>
              <p><strong>قاعدة البيانات:</strong> SQLite مع تشفير البيانات</p>
              <p><strong>لغة البرمجة:</strong> JavaScript</p>
              <p><strong>نظام التصميم:</strong> Bootstrap 5 مع دعم RTL</p>
              <hr />
              <p><strong>النسخة الحالية:</strong> {appVersion}</p>
              <p><strong>تاريخ الإصدار:</strong> ١ سبتمبر ٢٠٢٥</p>
              <hr />
              <p><strong>المشروع على GitHub:</strong></p>
              <a href={projectInfo.github} target="_blank" rel="noopener noreferrer">{projectInfo.github}</a>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6} className="mb-4">
          <Card>
            <Card.Header as="h5">
              <i className="fas fa-user-tie me-2"></i>تواصل مع المطور
            </Card.Header>
            <Card.Body>
              <Card.Title>{developerInfo.name}</Card.Title>
              <p><i className="fas fa-envelope me-2"></i><a href={`mailto:${developerInfo.email}`}>{developerInfo.email}</a></p>
              <p><i className="fab fa-whatsapp me-2"></i><a href={`https://wa.me/${developerInfo.whatsapp.replace('+', '')}`} target="_blank" rel="noopener noreferrer">{developerInfo.whatsapp}</a></p>
              <p><i className="fab fa-github me-2"></i><a href={developerInfo.github} target="_blank" rel="noopener noreferrer">GitHub</a></p>
              <p><i className="fab fa-linkedin me-2"></i><a href={developerInfo.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a></p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="mb-4">
        <Card.Header as="h5">
          <i className="fas fa-bug me-2"></i>الإبلاغ عن خطأ
        </Card.Header>
        <Card.Body>
          <Card.Text>إذا واجهت أي مشكلة أو خطأ في التطبيق، يرجى إبلاغنا للمساعدة في تحسينه. اتبع الخطوات التالية:</Card.Text>
          <ul>
            <li><strong>وصف المشكلة:</strong> اشرح الخطوات التي أدت إلى ظهور الخطأ.</li>
            <li><strong>النتيجة المتوقعة:</strong> ما الذي كنت تتوقع حدوثه؟</li>
            <li><strong>النتيجة الفعلية:</strong> ما الذي حدث بالفعل؟</li>
            <li><strong>لقطة شاشة:</strong> إذا أمكن، قم بإرفاق لقطة شاشة للخطأ.</li>
          </ul>
          <hr />
          <p>يمكنك إرسال تقرير الخطأ عبر البريد الإلكتروني أو واتساب:</p>
          <Button variant="primary" href={`mailto:${developerInfo.email}?subject=${bugReportSubject}&body=${bugReportBody}`} className="me-2">
            <i className="fas fa-envelope me-2"></i>إرسال عبر البريد الإلكتروني
          </Button>
          <Button variant="success" href={`https://wa.me/${developerInfo.whatsapp.replace('+', '')}?text=${whatsappMessage}`} target="_blank" rel="noopener noreferrer">
            <i className="fab fa-whatsapp me-2"></i>إرسال عبر واتساب
          </Button>
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Header as="h5">
          <i className="fas fa-heart me-2"></i>شكر وتقدير
        </Card.Header>
        <Card.Body>
          <Card.Text>نشكر كل من ساهم في دعم هذا المشروع.</Card.Text>
        </Card.Body>
      </Card>

    </Container>
  );
}

export default AboutPage;
