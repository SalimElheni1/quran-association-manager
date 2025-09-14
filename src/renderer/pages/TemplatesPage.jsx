import React, { useState, useEffect } from 'react';
import { Container, Table, Button, Alert, Card, Form, Row, Col } from 'react-bootstrap';
import { error as logError } from '@renderer/utils/logger';

function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  // --- Form State for New Template ---
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateType, setNewTemplateType] = useState('docx');
  const [newTemplateFile, setNewTemplateFile] = useState(null);

  const fetchTemplates = async () => {
    setIsLoading(true);
    const result = await window.electronAPI.getAllTemplates();
    if (result.success) {
      setTemplates(result.data);
    } else {
      setMessage({ type: 'danger', text: result.message || 'Failed to fetch templates.' });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this template? This cannot be undone.')) {
      const result = await window.electronAPI.deleteTemplate(id);
      if (result.success) {
        setMessage({ type: 'success', text: 'Template deleted successfully.' });
        fetchTemplates(); // Refresh the list
      } else {
        setMessage({ type: 'danger', text: result.message || 'Failed to delete template.' });
      }
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setNewTemplateFile(file);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!newTemplateFile || !newTemplateName || !newTemplateType) {
      setMessage({ type: 'warning', text: 'Please provide a name, type, and file.' });
      return;
    }

    setIsLoading(true);
    try {
      const content = await newTemplateFile.arrayBuffer();
      const result = await window.electronAPI.createTemplate({
        name: newTemplateName,
        type: newTemplateType,
        content: Buffer.from(content),
      });

      if (result.success) {
        setMessage({ type: 'success', text: 'Template uploaded successfully.' });
        setNewTemplateName('');
        setNewTemplateType('docx');
        setNewTemplateFile(null);
        e.target.reset(); // Reset the form
        fetchTemplates(); // Refresh
      } else {
        setMessage({ type: 'danger', text: result.message || 'Failed to upload template.' });
      }
    } catch (error) {
      logError('Error uploading template file:', error);
      setMessage({ type: 'danger', text: 'An error occurred while reading the file.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container className="page-container">
      <div className="page-header">
        <h1>Template Management</h1>
        <p className="lead">Manage custom templates for DOCX and PDF exports.</p>
      </div>

      {message.text && <Alert variant={message.type}>{message.text}</Alert>}

      <Card className="mb-4">
        <Card.Body>
          <Card.Title>Upload New Template</Card.Title>
          <Form onSubmit={handleUpload}>
            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Template Name</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g., Student Report Card"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Template Type</Form.Label>
                  <Form.Select value={newTemplateType} onChange={(e) => setNewTemplateType(e.target.value)}>
                    <option value="docx">DOCX</option>
                    <option value="pdf_html">PDF (HTML)</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Template File</Form.Label>
                  <Form.Control type="file" onChange={handleFileChange} required />
                </Form.Group>
              </Col>
            </Row>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Uploading...' : 'Upload Template'}
            </Button>
          </Form>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <h4>Existing Templates</h4>
        </Card.Header>
        <Card.Body>
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan="4" className="text-center">Loading...</td>
                </tr>
              )}
              {!isLoading && templates.map((template) => (
                <tr key={template.id}>
                  <td>{template.name} {template.is_default ? '(Default)' : ''}</td>
                  <td><span className={`badge bg-${template.type === 'docx' ? 'primary' : 'success'}`}>{template.type}</span></td>
                  <td>{new Date(template.created_at).toLocaleString()}</td>
                  <td>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(template.id)}
                      disabled={template.is_default}
                      title={template.is_default ? "Default templates cannot be deleted." : "Delete template"}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </Container>
  );
}

export default TemplatesPage;
