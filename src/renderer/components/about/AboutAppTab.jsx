import React from 'react';
import { Card, ListGroup, Accordion, Row, Col } from 'react-bootstrap';

const AboutAppTab = () => {
  return (
    <>
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
        <Accordion>
          <Accordion.Item eventKey="0">
            <Accordion.Header>
              <i className="fas fa-star me-2"></i>المميزات الرئيسية
            </Accordion.Header>
            <Accordion.Body>
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
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      </Card>
    </>
  );
};

export default AboutAppTab;
