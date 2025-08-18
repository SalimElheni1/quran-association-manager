import React, { useState } from 'react';
import { Container, Row, Col, Card, Tabs, Tab, Form, Button, Alert } from 'react-bootstrap';

// These field definitions are based on the 'User Schemas' documentation.
// In a real application, this might come from a shared configuration file.
const fieldDefinitions = {
  students: [
    { key: 'name', label: 'Full Name' },
    { key: 'date_of_birth', label: 'Date of Birth' },
    { key: 'gender', label: 'Gender' },
    { key: 'address', label: 'Address' },
    { key: 'contact_info', label: 'Phone Number' },
    { key: 'email', label: 'Email' },
    { key: 'enrollment_date', label: 'Enrollment Date' },
    { key: 'status', label: 'Status' },
    { key: 'memorization_level', label: 'Memorization Level' },
    { key: 'notes', label: 'Notes' },
    { key: 'parent_name', label: 'Parent Name' },
    { key: 'parent_contact', label: 'Parent Contact' },
  ],
  teachers: [
    { key: 'name', label: 'Full Name' },
    { key: 'national_id', label: 'National ID' },
    { key: 'contact_info', label: 'Phone Number' },
    { key: 'email', label: 'Email' },
    { key: 'specialization', label: 'Specialization' },
    { key: 'years_of_experience', label: 'Years of Experience' },
  ],
  admins: [
    { key: 'username', label: 'Username' },
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status' },
  ],
  attendance: [
    // Note: The backend query for attendance is currently not dynamic.
    // These fields are for display purposes and match the expected output.
    { key: 'student_name', label: 'Student Name' },
    { key: 'class_name', label: 'Class Name' },
    { key: 'date', label: 'Date' },
    { key: 'status', label: 'Status' },
  ],
};

const ExportTabPanel = ({ exportType, fields, isAttendance = false }) => {
  const [selectedFields, setSelectedFields] = useState(fields.map((f) => f.key));
  const [message, setMessage] = useState({ type: '', text: '' });
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const handleCheckboxChange = (event) => {
    const { value, checked } = event.target;
    if (checked) {
      setSelectedFields([...selectedFields, value]);
    } else {
      setSelectedFields(selectedFields.filter((field) => field !== value));
    }
  };

  const handleExport = async (format) => {
    setMessage({ type: '', text: '' });

    if (selectedFields.length === 0) {
      setMessage({ type: 'danger', text: 'Please select at least one field to export.' });
      return;
    }

    const headers = selectedFields.map((key) => {
      const field = fields.find((f) => f.key === key);
      return field ? field.label : key;
    });

    const exportOptions = {
      exportType,
      format,
      fields: selectedFields,
      headers,
    };

    if (isAttendance) {
      if (!startDate || !endDate) {
        setMessage({ type: 'danger', text: 'Please select a valid start and end date.' });
        return;
      }
      exportOptions.options = { startDate, endDate };
    }

    try {
      const result = await window.electronAPI.generateExport(exportOptions);

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
      } else {
        setMessage({ type: 'danger', text: result.message });
      }
    } catch (error) {
      setMessage({ type: 'danger', text: `An error occurred: ${error.message}` });
      console.error('Export failed:', error);
    }
  };

  return (
    <Card className="mt-3">
      <Card.Body>
        <Card.Title>Export {exportType.charAt(0).toUpperCase() + exportType.slice(1)}</Card.Title>
        <p>Select the fields you want to include in the export.</p>
        <Form>
          {isAttendance && (
            <Row className="mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Start Date</Form.Label>
                  <Form.Control
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>End Date</Form.Label>
                  <Form.Control
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </Form.Group>
              </Col>
            </Row>
          )}
          <Row>
            {fields.map((field) => (
              <Col md={4} key={field.key}>
                <Form.Check
                  type="checkbox"
                  id={`${exportType}-${field.key}`}
                  label={field.label}
                  value={field.key}
                  checked={selectedFields.includes(field.key)}
                  onChange={handleCheckboxChange}
                />
              </Col>
            ))}
          </Row>

          <hr />

          {message.text && <Alert variant={message.type}>{message.text}</Alert>}

          <div className="d-flex justify-content-end">
            <Button variant="primary" className="me-2" onClick={() => handleExport('xlsx')}>
              Export to Excel
            </Button>
            <Button variant="danger" onClick={() => handleExport('pdf')}>
              Export to PDF
            </Button>
          </div>
        </Form>
      </Card.Body>
    </Card>
  );
};

const ExportsPage = () => {
  return (
    <Container fluid className="p-4">
      <Row>
        <Col>
          <h2 className="h4">Data Exports</h2>
          <p>
            This module allows you to export various types of data from the application into PDF or
            Excel formats for reporting and analysis.
          </p>
        </Col>
      </Row>
      <Tabs defaultActiveKey="students" id="export-tabs" className="mb-3">
        <Tab eventKey="students" title="Students">
          <ExportTabPanel exportType="students" fields={fieldDefinitions.students} />
        </Tab>
        <Tab eventKey="teachers" title="Teachers">
          <ExportTabPanel exportType="teachers" fields={fieldDefinitions.teachers} />
        </Tab>
        <Tab eventKey="admins" title="Admins">
          <ExportTabPanel exportType="admins" fields={fieldDefinitions.admins} />
        </Tab>
        <Tab eventKey="attendance" title="Attendance Register">
          <ExportTabPanel
            exportType="attendance"
            fields={fieldDefinitions.attendance}
            isAttendance={true}
          />
        </Tab>
      </Tabs>
    </Container>
  );
};

export default ExportsPage;
