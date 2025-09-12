import React from 'react';
import { Alert, Card, ListGroup } from 'react-bootstrap';

const ImportResults = ({ results }) => {
  if (!results) {
    return null;
  }

  const { successCount, errorCount, errors, newUsers } = results;

  return (
    <Card className="mt-4">
      <Card.Header as="h5">نتائج الاستيراد</Card.Header>
      <Card.Body>
        <Alert variant={errorCount > 0 ? 'warning' : 'success'}>
          <p>
            <strong>السجلات الناجحة:</strong> {successCount}
          </p>
          <p className="mb-0">
            <strong>السجلات الفاشلة:</strong> {errorCount}
          </p>
        </Alert>

        {newUsers?.length > 0 && (
          <div className="mt-3">
            <h6>المستخدمون الجدد (يرجى حفظ كلمات المرور هذه في مكان آمن):</h6>
            <ListGroup>
              {newUsers.map((user, index) => (
                <ListGroup.Item key={index}>
                  <strong>{user.username}:</strong> <code>{user.password}</code>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </div>
        )}

        {errors?.length > 0 && (
          <div className="mt-3">
            <h6>تفاصيل الأخطاء:</h6>
            <ListGroup variant="flush">
              {errors.map((error, index) => (
                <ListGroup.Item key={index} variant="danger">
                  {error}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default ImportResults;
