import React, { useState, useEffect } from 'react';
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Spinner,
  Alert,
  Tabs,
  Tab,
  InputGroup,
  Image,
} from 'react-bootstrap';
import { toast } from 'react-toastify';

const SettingsPage = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [backupStatus, setBackupStatus] = useState(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isUploading, setIsUploading] = useState(null); // Can be 'national' or 'regional'

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const settingsResponse = await window.electronAPI.getSettings();
        if (settingsResponse.success) {
          setSettings(settingsResponse.settings);
        } else {
          setError(settingsResponse.message);
        }

        const backupStatusResponse = await window.electronAPI.getBackupStatus();
        if (backupStatusResponse.success) {
          setBackupStatus(backupStatusResponse.status);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings({
      ...settings,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleFileSelect = async (fieldName) => {
    setIsUploading(fieldName);
    try {
      const response = await window.electronAPI.uploadLogo();
      if (response.success) {
        setSettings({ ...settings, [fieldName]: response.path });
        toast.success('تم تحميل الشعار بنجاح.');
      } else if (response.message !== 'No file selected.') {
        // Don't show error if user just cancelled the dialog
        toast.error(`فشل تحميل الشعار: ${response.message}`);
      }
    } catch (err) {
      toast.error(`حدث خطأ أثناء تحميل الشعار: ${err.message}`);
    } finally {
      setIsUploading(null);
    }
  };

  const handleDirectorySelect = async (fieldName) => {
    const response = await window.electronAPI.openDirectoryDialog();
    if (response.success) {
      setSettings({ ...settings, [fieldName]: response.path });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await window.electronAPI.updateSettings(settings);
      if (response.success) {
        toast.success(response.message);
      } else {
        toast.error(response.message);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunBackup = async () => {
    setIsBackingUp(true);
    toast.info('بدء عملية النسخ الاحتياطي...');
    try {
      const response = await window.electronAPI.runBackup(settings);
      if (response.success) {
        toast.success(response.message);
        // Refresh backup status
        const statusResponse = await window.electronAPI.getBackupStatus();
        if (statusResponse.success) {
          setBackupStatus(statusResponse.status);
        }
      } else {
        toast.error(response.message);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center vh-100">
        <Spinner animation="border" />
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container fluid="lg" className="py-4">
      <Row className="justify-content-center">
        <Col lg={10}>
          <Card>
            <Card.Header as="h3" className="text-center bg-primary text-white">
              إعدادات التطبيق
            </Card.Header>
            <Card.Body>
              <Form onSubmit={handleSubmit}>
                <Tabs defaultActiveKey="association" id="settings-tabs" className="mb-3" fill>
                  <Tab eventKey="association" title="بيانات الجمعية">
                    <Card className="border-0">
                      <Card.Body>
                        <Form.Group className="mb-3">
                          <Form.Label>اسم الجمعية الوطنية</Form.Label>
                          <Form.Control
                            type="text"
                            name="national_association_name"
                            value={settings.national_association_name || ''}
                            onChange={handleChange}
                          />
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>اسم الجمعية الإقليمية</Form.Label>
                          <Form.Control
                            type="text"
                            name="regional_association_name"
                            value={settings.regional_association_name || ''}
                            onChange={handleChange}
                          />
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>اسم الفرع المحلي</Form.Label>
                          <Form.Control
                            type="text"
                            name="local_branch_name"
                            value={settings.local_branch_name || ''}
                            onChange={handleChange}
                          />
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>اسم الرئيس الكامل</Form.Label>
                          <Form.Control
                            type="text"
                            name="president_full_name"
                            value={settings.president_full_name || ''}
                            onChange={handleChange}
                          />
                        </Form.Group>
                      </Card.Body>
                    </Card>
                  </Tab>

                  <Tab eventKey="branding" title="الشعارات والهوية">
                    <Card className="border-0">
                      <Card.Body>
                        <Form.Group className="mb-3">
                          <Form.Label>شعار الجمعية الوطنية</Form.Label>
                          <InputGroup>
                            <Button
                              variant="outline-secondary"
                              onClick={() => handleFileSelect('national_logo_path')}
                              disabled={isUploading === 'national_logo_path'}
                            >
                              {isUploading === 'national_logo_path' ? (
                                <>
                                  <Spinner as="span" animation="border" size="sm" />
                                  {' جاري التحميل...'}
                                </>
                              ) : (
                                'اختر ملف...'
                              )}
                            </Button>
                            <Form.Control
                              type="text"
                              value={settings.national_logo_path || ''}
                              readOnly
                            />
                          </InputGroup>
                          {settings.national_logo_path && (
                            <Image
                              src={`safe-image://${settings.national_logo_path}`}
                              thumbnail
                              className="mt-2"
                              style={{ maxHeight: '100px' }}
                              onError={(e) => {
                                e.target.style.display = 'none';
                                console.error('Failed to load image:', settings.national_logo_path);
                              }}
                            />
                          )}
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>شعار الجمعية الإقليمية/المحلية</Form.Label>
                          <InputGroup>
                            <Button
                              variant="outline-secondary"
                              onClick={() => handleFileSelect('regional_local_logo_path')}
                              disabled={isUploading === 'regional_local_logo_path'}
                            >
                              {isUploading === 'regional_local_logo_path' ? (
                                <>
                                  <Spinner as="span" animation="border" size="sm" />
                                  {' جاري التحميل...'}
                                </>
                              ) : (
                                'اختر ملف...'
                              )}
                            </Button>
                            <Form.Control
                              type="text"
                              value={settings.regional_local_logo_path || ''}
                              readOnly
                            />
                          </InputGroup>
                          {settings.regional_local_logo_path && (
                            <Image
                              src={`safe-image://${settings.regional_local_logo_path}`}
                              thumbnail
                              className="mt-2"
                              style={{ maxHeight: '100px' }}
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          )}
                        </Form.Group>
                      </Card.Body>
                    </Card>
                  </Tab>

                  <Tab eventKey="backup" title="سياسة النسخ الاحتياطي">
                    <Card className="border-0">
                      <Card.Body>
                        <Form.Group className="mb-3">
                          <Form.Check
                            type="switch"
                            id="backup-enabled-switch"
                            label="تفعيل النسخ الاحتياطي التلقائي"
                            name="backup_enabled"
                            checked={settings.backup_enabled || false}
                            onChange={handleChange}
                            disabled={!settings.backup_path}
                          />
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>تكرار النسخ الاحتياطي</Form.Label>
                          <Form.Select
                            name="backup_frequency"
                            value={settings.backup_frequency || 'daily'}
                            onChange={handleChange}
                            disabled={!settings.backup_enabled}
                          >
                            <option value="daily">يوميًا</option>
                            <option value="weekly">أسبوعيًا</option>
                            <option value="monthly">شهريًا</option>
                          </Form.Select>
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>مسار حفظ النسخ الاحتياطي</Form.Label>
                          <InputGroup>
                            <Button
                              variant="outline-secondary"
                              onClick={() => handleDirectorySelect('backup_path')}
                            >
                              اختر مجلد...
                            </Button>
                            <Form.Control type="text" value={settings.backup_path || ''} readOnly />
                          </InputGroup>
                        </Form.Group>
                        <hr />
                        <div className="d-flex justify-content-between align-items-center">
                          <Button
                            variant="info"
                            onClick={handleRunBackup}
                            disabled={isBackingUp || !settings.backup_path}
                          >
                            {isBackingUp ? (
                              <>
                                <Spinner as="span" animation="border" size="sm" />
                                {' جاري النسخ...'}
                              </>
                            ) : (
                              <>
                                <i className="fas fa-play-circle me-2"></i>
                                تشغيل النسخ الاحتياطي الآن
                              </>
                            )}
                          </Button>
                          {backupStatus && (
                            <small
                              className={backupStatus.success ? 'text-success' : 'text-danger'}
                            >
                              آخر نسخة احتياطية: {new Date(backupStatus.timestamp).toLocaleString()}{' '}
                              - {backupStatus.success ? 'نجحت' : 'فشلت'}
                            </small>
                          )}
                        </div>
                      </Card.Body>
                    </Card>
                  </Tab>
                </Tabs>

                <div className="d-grid mt-4">
                  <Button variant="primary" type="submit" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Spinner as="span" animation="border" size="sm" />
                        {' جاري الحفظ...'}
                      </>
                    ) : (
                      'حفظ الإعدادات'
                    )}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default SettingsPage;
