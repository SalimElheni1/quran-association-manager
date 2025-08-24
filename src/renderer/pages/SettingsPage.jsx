import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
import PasswordPromptModal from '../components/PasswordPromptModal';

const SettingsPage = () => {
  const { state } = useLocation();
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [backupStatus, setBackupStatus] = useState(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isUploading, setIsUploading] = useState(null); // Can be 'national' or 'regional'
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [activeTab, setActiveTab] = useState(state?.defaultTab || 'association');


  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const settingsResponse = await window.electronAPI.getSettings();
        if (settingsResponse.success) {
          const loadedSettings = settingsResponse.settings;
          setSettings(loadedSettings);

          // Only fetch the backup status if a backup path is already configured.
          // This prevents showing a stale status from a previous configuration
          // if the user is setting up backups for the first time or after a reset.
          if (loadedSettings && loadedSettings.backup_path) {
            const backupStatusResponse = await window.electronAPI.getBackupStatus();
            if (backupStatusResponse.success) {
              setBackupStatus(backupStatusResponse.status);
            }
          }
        } else {
          setError(settingsResponse.message);
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
      // The backend's runBackup function incorrectly checks for `backup_enabled`,
      // which is for automatic backups. A manual backup should only require a path.
      // To work around this, we pass a specific configuration object for the manual
      // run that satisfies the backend check.
      const response = await window.electronAPI.runBackup({
        backup_path: settings.backup_path,
        backup_enabled: true, // Force true for manual run to pass backend validation
      });
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

  const handleImportDb = () => {
    setShowPasswordModal(true);
  };

  const handlePasswordConfirm = async (password) => {
    setShowPasswordModal(false);
    if (!password) {
      toast.warn('تم إلغاء عملية الاستيراد.');
      return;
    }

    setIsImporting(true);
    toast.info('بدء عملية استيراد قاعدة البيانات...');

    try {
      const result = await window.electronAPI.importDatabase({ password, userId: user.id });

      if (result.success) {
        toast.success(result.message, { autoClose: false }); // Keep message open
      } else {
        toast.error(`فشل الاستيراد: ${result.message}`);
      }
    } catch (err) {
      toast.error(`حدث خطأ فادح: ${err.message}`);
      console.error(err);
    } finally {
      setIsImporting(false);
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
              إعدادات النظام
            </Card.Header>
            <Card.Body>
              <Form onSubmit={handleSubmit}>
                <Tabs
                  activeKey={activeTab}
                  onSelect={(k) => setActiveTab(k)}
                  id="settings-tabs"
                  className="mb-3"
                  fill
                >
                  <Tab eventKey="association" title="بيانات الجمعية/الفرع">
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
                          <Form.Label>اسم الجمعية الجهوية</Form.Label>
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

                  <Tab eventKey="branding" title="الهوية البصرية">
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
                                  {' جارٍ التحميل...'}
                                </>
                              ) : (
                                'اختر ملف الشعار...'
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
                          <Form.Label>شعار الفرع الجهوي/المحلي</Form.Label>
                          <InputGroup>
                            <Button
                              variant="outline-secondary"
                              onClick={() => handleFileSelect('regional_local_logo_path')}
                              disabled={isUploading === 'regional_local_logo_path'}
                            >
                              {isUploading === 'regional_local_logo_path' ? (
                                <>
                                  <Spinner as="span" animation="border" size="sm" />
                                  {' جارٍ التحميل...'}
                                </>
                              ) : (
                                'اختر ملف الشعار...'
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
                  <Tab eventKey="general" title="إعدادات عامة">
                    <Card className="border-0">
                      <Card.Body>
                        <Form.Group as={Row} className="mb-3">
                          <Form.Label column sm={4}>
                            سن الرشد (للتقارير والتصنيف)
                          </Form.Label>
                          <Col sm={8}>
                            <Form.Control
                              type="number"
                              name="adultAgeThreshold"
                              value={settings.adultAgeThreshold || 18}
                              onChange={handleChange}
                              min="1"
                              max="100"
                            />
                            <Form.Text className="text-muted">
                              يستخدم هذا العمر لتصنيف الطلاب إلى أطفال وبالغين في التقارير وخيارات
                              التصدير.
                            </Form.Text>
                          </Col>
                        </Form.Group>
                      </Card.Body>
                    </Card>
                  </Tab>
                  <Tab eventKey="backup" title="النسخ الاحتياطي">
                    <Card className="border-0">
                      <Card.Body>
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
                          {!settings.backup_path && (
                            <Form.Text className="text-muted">
                              يجب تحديد مسار لحفظ النسخ الاحتياطية لتفعيل خيارات النسخ التلقائي
                              واليدوي.
                            </Form.Text>
                          )}
                        </Form.Group>
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
                          <Form.Label>جدولة النسخ الاحتياطي</Form.Label>
                          <Form.Select
                            name="backup_frequency"
                            value={settings.backup_frequency || 'daily'}
                            onChange={handleChange}
                            disabled={!settings.backup_enabled || !settings.backup_path}
                          >
                            <option value="daily">يوميًا</option>
                            <option value="weekly">أسبوعيًا</option>
                            <option value="monthly">شهريًا</option>
                          </Form.Select>
                        </Form.Group>

                        <h5 className="mt-4">تنبيهات النسخ الاحتياطي</h5>
                        <Form.Group className="mb-3">
                          <Form.Check
                            type="switch"
                            id="backup-reminder-enabled-switch"
                            label="تفعيل التنبيهات لعمل نسخ احتياطية"
                            name="backup_reminder_enabled"
                            checked={settings.backup_reminder_enabled || false}
                            onChange={handleChange}
                          />
                        </Form.Group>
                        <Form.Group as={Row} className="mb-3">
                          <Form.Label column sm={8}>
                            تذكيري بعد مرور (أيام)
                          </Form.Label>
                          <Col sm={4}>
                            <Form.Control
                              type="number"
                              name="backup_reminder_frequency_days"
                              value={settings.backup_reminder_frequency_days || 7}
                              onChange={handleChange}
                              disabled={!settings.backup_reminder_enabled}
                              min="1"
                              max="365"
                            />
                          </Col>
                        </Form.Group>
                        <hr />
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <Button
                            variant="info"
                            onClick={handleRunBackup}
                            disabled={isBackingUp || !settings.backup_path || isImporting}
                          >
                            {isBackingUp ? (
                              <>
                                <Spinner as="span" animation="border" size="sm" />
                                {' جارٍ النسخ...'}
                              </>
                            ) : (
                              'نسخ احتياطي فوري'
                            )}
                          </Button>
                          {backupStatus && settings.backup_path && (
                            <small
                              className={backupStatus.success ? 'text-success' : 'text-danger'}
                            >
                              آخر نسخة: {new Date(backupStatus.timestamp).toLocaleString()} (
                              {backupStatus.success ? 'نجحت' : 'فشلت'})
                            </small>
                          )}
                        </div>
                        <hr />
                        <div className="mt-3">
                          <h5 className="text-danger">منطقة الخطر</h5>
                          <p>
                            استيراد قاعدة بيانات سيستبدل جميع البيانات الحالية. سيتم أخذ نسخة
                            احتياطية من بياناتك الحالية قبل المتابعة.
                          </p>
                          <Button
                            variant="danger"
                            onClick={handleImportDb}
                            disabled={isImporting || isBackingUp}
                          >
                            {isImporting ? (
                              <>
                                <Spinner as="span" animation="border" size="sm" />
                                {' جارٍ الاستيراد...'}
                              </>
                            ) : (
                              'استيراد قاعدة بيانات'
                            )}
                          </Button>
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
                        {' جارٍ الحفظ...'}
                      </>
                    ) : (
                      'حفظ التغييرات'
                    )}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <PasswordPromptModal
        show={showPasswordModal}
        onHide={() => setShowPasswordModal(false)}
        onConfirm={handlePasswordConfirm}
        title="تأكيد استيراد قاعدة البيانات"
        body="لأسباب أمنية، يرجى إدخال كلمة المرور الحالية للمتابعة. سيتم استخدامها للتحقق من توافق قاعدة البيانات المستوردة."
      />
    </Container>
  );
};

export default SettingsPage;
