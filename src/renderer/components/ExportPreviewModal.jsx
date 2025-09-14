import React from 'react';
import { Modal, Button, Table, Spinner, Alert } from 'react-bootstrap';

const ExportPreviewModal = ({ show, onHide, title, columns, data, isLoading, error }) => {
  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>معاينة التصدير: {title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isLoading && <div className="text-center"><Spinner animation="border" /></div>}
        {error && <Alert variant="danger">{error}</Alert>}
        {!isLoading && !error && data && (
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                {columns.map((col) => <th key={col.key}>{col.header}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((col) => <td key={`${rowIndex}-${col.key}`}>{row[col.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {!isLoading && !error && (!data || data.length === 0) && (
            <Alert variant="info">لا توجد بيانات للمعاينة.</Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          إغلاق
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ExportPreviewModal;
