import React from 'react';
import { Card, Row, Col } from 'react-bootstrap';
import CogsIcon from '../icons/CogsIcon';

const TechnicalDetailsTab = ({ appVersion, projectInfo }) => {
  return (
    <Row>
      <Col md={12} className="mb-4">
        <Card>
          <Card.Header as="h5">
            <CogsIcon className="me-2" />
            تقنيات التطوير
          </Card.Header>
          <Card.Body>
            <p>
              <strong>الواجهة الأمامية:</strong> React مع React Bootstrap
            </p>
            <p>
              <strong>النظام الخلفي:</strong> Electron.js
            </p>
            <p>
              <strong>قاعدة البيانات:</strong> SQLite مع تشفير البيانات
            </p>
            <p>
              <strong>لغة البرمجة:</strong> JavaScript
            </p>
            <p>
              <strong>نظام التصميم:</strong> Bootstrap 5 مع دعم RTL
            </p>
            <hr />
            <p>
              <strong>النسخة الحالية:</strong> {appVersion}
            </p>
            <p>
              <strong>تاريخ الإصدار:</strong> ١ سبتمبر ٢٠٢٥
            </p>
            <hr />
            <p>
              <strong>المشروع على GitHub:</strong>
            </p>
            <a href={projectInfo.github} target="_blank" rel="noopener noreferrer">
              {projectInfo.github}
            </a>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
};

export default TechnicalDetailsTab;
