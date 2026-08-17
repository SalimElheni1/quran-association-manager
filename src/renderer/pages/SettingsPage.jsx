import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@renderer/contexts/AuthContext';
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
import InfoIcon from '@renderer/components/icons/InfoIcon';
import PasswordPromptModal from '@renderer/components/PasswordPromptModal';
import AgeGroupsTab from '@renderer/components/settings/AgeGroupsTab';

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
  const [isUploading, setIsUploading] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [activeTab, setActiveTab] = useState(state?.defaultTab || 'association');

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const settingsResponse = await window.electronAPI.getSettings();
        if (settingsResponse.success) {
          const loadedSettings = settingsResponse.settings;
          setSettings(loadedSettings);

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
      const filteredSettings = { ...settings };
      delete filteredSettings.adultAgeThreshold;
      delete filteredSettings.adult_age_threshold;
      const response = await window.electronAPI.updateSettings(filteredSettings);
      if (response.success) {
        toast.success(response.message);
        window.dispatchEvent(new Event('settings-updated'));
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

  const handlePasswordConfirm = async (password, backupKey) => {
    const downloadedFilePath = typeof showPasswordModal === 'string' ? showPasswordModal : null;
    setShowPasswordModal(false);

    if (!password) {
      toast.warn('تم إلغاء عملية الاستيراد.');
      return;
    }

    setIsImporting(true);
    toast.info('بدء استبدال قاعدة البيانات...');

    try {
      const result = await window.electronAPI.importDatabase({
        password,
        userId: user.id,
        filePath: downloadedFilePath,
        backupPassword: backupKey || undefined,
      });

      if (result.success) {
        toast.success('تم استيراد قاعدة البيانات بنجاح! سيتم إعادة تشغيل التطبيق لتطبيق التغييرات.', {
          autoClose: 3000,
          onClose: () => window.electronAPI.relaunchApp()
        });
      } else {
        toast.error(`فشل الاستبدال: ${result.message}`);
      }
    } catch (err) {
      toast.error(`حدث خطأ فادح: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportDb = async () => {
    const response = await window.electronAPI.openFileDialog({
      filters: [
        { name: 'Quran DB Backups / نسخ احتياطية (*.qdb)', extensions: ['qdb', 'QDB'] },
        { name: 'All Files / كل الملفات (*.*)', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    
    if (response.canceled || !response.filePaths || response.filePaths.length === 0) {
      return;
    }

    const filePath = response.filePaths[0];
    setShowPasswordModal(filePath);
  };

  if (loading) return <Container className="d-flex justify-content-center align-items-center vh-100"><Spinner animation="border" /></Container>;
  if (error) return <Container><Alert variant="danger">{error}</Alert></Container>;

  return (
    <Container fluid="lg" className="py-4">
      <Row className="justify-content-center">
        <Col lg={11}>
          <Card className="shadow-sm">
            <Card.Header as="h4" className="text-center bg-primary text-white py-3">
              إعدادات النظام والنسخ الاحتياطي
            </Card.Header>
            <Card.Body className="p-4">
              <Form onSubmit={handleSubmit}>
                <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k)} className="mb-4 custom-tabs" fill>
                  <Tab eventKey="association" title="بيانات الجمعية/الفرع">
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>اسم الجمعية الوطنية</Form.Label>
                          <Form.Control type="text" name="national_association_name" value={settings.national_association_name || ''} onChange={handleChange} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>اسم الفرع الجهوي</Form.Label>
                          <Form.Control type="text" name="regional_association_name" value={settings.regional_association_name || ''} onChange={handleChange} />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-3">
                          <Form.Label>اسم الفرع المحلي</Form.Label>
                          <Form.Control type="text" name="local_branch_name" value={settings.local_branch_name || ''} onChange={handleChange} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                          <Form.Label>اسم الرئيس الكامل</Form.Label>
                          <Form.Control type="text" name="president_full_name" value={settings.president_full_name || ''} onChange={handleChange} />
                        </Form.Group>
                      </Col>
                    </Row>
                  </Tab>

                  <Tab eventKey="branding" title="الهوية البصرية">
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-4">
                          <Form.Label>شعار الجمعية الوطنية</Form.Label>
                          <InputGroup>
                            <Button variant="outline-primary" onClick={() => handleFileSelect('national_logo_path')} disabled={isUploading === 'national_logo_path'}>
                              {isUploading === 'national_logo_path' ? <Spinner size="sm" /> : 'تحميل...'}
                            </Button>
                            <Form.Control type="text" value={settings.national_logo_path || ''} readOnly />
                          </InputGroup>
                          {settings.national_logo_path && (
                            <div className="mt-3 p-2 border rounded text-center bg-light">
                              <Image src={`safe-image://${settings.national_logo_path}`} style={{ maxHeight: '120px', maxWidth: '100%' }} />
                            </div>
                          )}
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-4">
                          <Form.Label>شعار الفرع المحلي</Form.Label>
                          <InputGroup>
                            <Button variant="outline-primary" onClick={() => handleFileSelect('regional_local_logo_path')} disabled={isUploading === 'regional_local_logo_path'}>
                              {isUploading === 'regional_local_logo_path' ? <Spinner size="sm" /> : 'تحميل...'}
                            </Button>
                            <Form.Control type="text" value={settings.regional_local_logo_path || ''} readOnly />
                          </InputGroup>
                          {settings.regional_local_logo_path && (
                            <div className="mt-3 p-2 border rounded text-center bg-light">
                              <Image src={`safe-image://${settings.regional_local_logo_path}`} style={{ maxHeight: '120px', maxWidth: '100%' }} />
                            </div>
                          )}
                        </Form.Group>
                      </Col>
                    </Row>
                  </Tab>

                  <Tab eventKey="general" title="إعدادات الرسوم">
                    <Card className="border-0 bg-light p-3">
                      <h6 className="mb-3">إعدادات الرسوم الدراسية</h6>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>الرسم السنوي الافتراضي</Form.Label>
                            <InputGroup>
                              <Form.Control type="number" name="annual_fee" value={settings.annual_fee || ''} onChange={handleChange} min="0" step="0.01" />
                              <InputGroup.Text>د.ت</InputGroup.Text>
                            </InputGroup>
                            <Form.Text className="text-muted">
                              الرسم السنوي الذي سيتم تطبيقه على الطلاب الذين يمكن أن يدفعوا.
                            </Form.Text>
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>الرسوم الشهرية</Form.Label>
                            <InputGroup>
                              <Form.Control type="number" name="standard_monthly_fee" value={settings.standard_monthly_fee || ''} onChange={handleChange} min="0" step="0.01" />
                              <InputGroup.Text>د.ت</InputGroup.Text>
                            </InputGroup>
                            <Form.Text className="text-muted">
                              الرسم الشهري الذي سيتم تطبيقه على الطلاب المسجلين في الفصول.
                            </Form.Text>
                          </Form.Group>
                        </Col>
                      </Row>
                      <Alert variant="warning" className="mb-4">
                        <strong>⚠️ تحذير مهم حول تغيير الرسوم:</strong>
                        <ul className="mb-0 mt-2">
                          <li>
                            تغيير الرسوم السنوية أو الشهرية <strong>لن يؤثر</strong> على الرسوم المولدة مسبقاً
                          </li>
                          <li>الطلاب الذين دفعوا بالفعل لن يتأثروا بهذا التغيير</li>
                          <li>الرسوم الجديدة ستطبق فقط على الطلاب الجدد أو عند توليد رسوم جديدة</li>
                          <li>لضمان الاتساق، يُفضل تغيير الرسوم في بداية السنة الدراسية</li>
                        </ul>
                      </Alert>

                      <h6 className="mb-3">نظام الدفع حسب نوع الفصل</h6>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>نظام الدفع للرجال</Form.Label>
                            <Form.Select name="men_payment_frequency" value={settings.men_payment_frequency || 'MONTHLY'} onChange={handleChange}>
                              <option value="MONTHLY">شهري (يدفع كل شهر)</option>
                              <option value="ANNUAL">سنوي (يدفع مرة واحدة للسنة)</option>
                            </Form.Select>
                            <Form.Text className="text-muted">يطبق على الطلاب المسجلين في فصول الرجال</Form.Text>
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>نظام الدفع للنساء</Form.Label>
                            <Form.Select name="women_payment_frequency" value={settings.women_payment_frequency || 'MONTHLY'} onChange={handleChange}>
                              <option value="MONTHLY">شهري (يدفع كل شهر)</option>
                              <option value="ANNUAL">سنوي (يدفع مرة واحدة للسنة)</option>
                            </Form.Select>
                            <Form.Text className="text-muted">يطبق على الطلاب المسجلين في فصول النساء</Form.Text>
                          </Form.Group>
                        </Col>
                      </Row>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>نظام الدفع للأطفال</Form.Label>
                            <Form.Select name="kids_payment_frequency" value={settings.kids_payment_frequency || 'MONTHLY'} onChange={handleChange}>
                              <option value="MONTHLY">شهري (يدفع كل شهر)</option>
                              <option value="ANNUAL">سنوي (يدفع مرة واحدة للسنة)</option>
                            </Form.Select>
                            <Form.Text className="text-muted">يطبق على الطلاب المسجلين في فصول الأطفال</Form.Text>
                          </Form.Group>
                        </Col>
                      </Row>

                      <h6 className="mb-3">إعدادات السنة الدراسية والتوليد التلقائي</h6>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>شهر بداية السنة الدراسية</Form.Label>
                            <Form.Select name="academic_year_start_month" value={settings.academic_year_start_month || 9} onChange={handleChange}>
                              <option value="1">يناير</option>
                              <option value="2">فبراير</option>
                              <option value="3">مارس</option>
                              <option value="4">أبريل</option>
                              <option value="5">مايو</option>
                              <option value="6">يونيو</option>
                              <option value="7">يوليو</option>
                              <option value="8">أغسطس</option>
                              <option value="9">سبتمبر (افتراضي)</option>
                              <option value="10">أكتوبر</option>
                              <option value="11">نوفمبر</option>
                              <option value="12">ديسمبر</option>
                            </Form.Select>
                            <Form.Text className="text-muted">
                              يحدد متى تبدأ السنة الدراسية (مثال: سبتمبر 2024 = سنة 2024-2025)
                            </Form.Text>
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>يوم توليد رسوم الشهر القادم</Form.Label>
                            <Form.Control type="number" name="charge_generation_day" value={settings.charge_generation_day || 25} onChange={handleChange} min="1" max="28" />
                            <Form.Text className="text-muted">
                              سيتم توليد رسوم الشهر القادم تلقائياً في هذا اليوم من كل شهر (افتراضي: 25)
                            </Form.Text>
                          </Form.Group>
                        </Col>
                      </Row>
                      <Alert variant="info" className="small py-2 mb-0">
                        <InfoIcon size={16} className="me-1 ms-1" />
                        <ul className="mb-0 mt-1">
                          <li>سيتم توليد الرسوم تلقائياً كل شهر. لا حاجة للتوليد اليدوي.</li>
                          <li>عند تحديد الرسوم لأول مرة، سيتم إنشاء رسوم الشهر الحالي لجميع الطلاب.</li>
                          <li>الخصومات الدائمة للطلاب ستطبق تلقائياً على جميع الرسوم.</li>
                        </ul>
                      </Alert>
                    </Card>
                  </Tab>

                  <Tab eventKey="age-groups" title="فئات عمرية">
                    <AgeGroupsTab />
                  </Tab>

                  <Tab eventKey="backup" title="النسخ الاحتياطي">
                    <Row className="g-4">
                      {/* Local Backup Section */}
                      <Col md={12}>
                        <Card className="shadow-sm border">
                          <Card.Body>
                            <div className="d-flex align-items-center mb-3 text-primary border-bottom pb-2">
                              <h5 className="mb-0">النسخ الاحتياطي المحلي</h5>
                            </div>
                            <Form.Group className="mb-3">
                              <Form.Label className="small text-muted">مسار حفظ النسخ الاحتياطي</Form.Label>
                              <InputGroup size="sm">
                                <Button variant="secondary" onClick={() => handleDirectorySelect('backup_path')}>اختيار...</Button>
                                <Form.Control type="text" value={settings.backup_path || ''} readOnly />
                              </InputGroup>
                            </Form.Group>
                            <Form.Group className="mb-3">
                              <Form.Label className="small">رمز النقل الموحد للمؤسسة (Association Transfer Key)</Form.Label>
                              <Form.Control
                                size="sm"
                                type="text"
                                name="association_transfer_key"
                                placeholder="أدخل رمز النقل المشترك لتبادل قواعد البيانات بين أجهزة الجمعية"
                                value={settings.association_transfer_key || ''}
                                onChange={handleChange}
                              />
                              <Form.Text className="text-muted small">
                                يُستخدم هذا الرمز لفك تشفير وتأمين النسخ الاحتياطية المتبادلة بين أجهزة الجمعية.
                              </Form.Text>
                            </Form.Group>
                            <Form.Check type="switch" label="تفعيل النسخ التلقائي" name="backup_enabled" checked={settings.backup_enabled || false} onChange={handleChange} disabled={!settings.backup_path} className="mb-3" />
                            <Row>
                              <Col md={6}>
                                <Form.Group className="mb-4">
                                  <Form.Label className="small">تكرار النسخ</Form.Label>
                                  <Form.Select size="sm" name="backup_frequency" value={settings.backup_frequency || 'daily'} onChange={handleChange} disabled={!settings.backup_enabled}>
                                    <option value="daily">يوميًا</option>
                                    <option value="weekly">أسبوعيًا</option>
                                    <option value="monthly">شهريًا</option>
                                  </Form.Select>
                                </Form.Group>
                              </Col>
                              <Col md={6}>
                                <Form.Group className="mb-4">
                                  <Form.Label className="small">توقيت النسخ</Form.Label>
                                  <Form.Control size="sm" type="time" name="backup_time" value={settings.backup_time || '02:00'} onChange={handleChange} disabled={!settings.backup_enabled} />
                                </Form.Group>
                              </Col>
                            </Row>
                            <div className="d-flex gap-2">
                              <Button variant="outline-success" size="sm" onClick={handleRunBackup} disabled={isBackingUp || !settings.backup_path}>
                                {isBackingUp ? <Spinner size="sm" /> : 'نسخ احتياطي الآن'}
                              </Button>
                              <Button variant="outline-danger" size="sm" onClick={() => handleImportDb()} disabled={isImporting || isBackingUp}>
                                استيراد قاعدة بيانات محلية
                              </Button>
                            </div>
                            {backupStatus && (
                              <div className="mt-3 small text-center text-muted border-top pt-2">
                                آخر نسخة: {new Date(backupStatus.timestamp).toLocaleString()}
                                <br />
                                <span className={backupStatus.success ? 'text-success' : 'text-danger'}>
                                  الحالة: {backupStatus.success ? 'ناجحة' : 'فاشلة'}
                                </span>
                              </div>
                            )}
                          </Card.Body>
                        </Card>
                      </Col>
                    </Row>
                  </Tab>
                </Tabs>

                <div className="d-grid mt-4">
                  <Button variant="primary" type="submit" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? <Spinner size="sm" className="me-2" /> : 'حفظ جميع التغييرات'}
                  </Button>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <PasswordPromptModal
        show={!!showPasswordModal}
        onHide={() => setShowPasswordModal(false)}
        onConfirm={handlePasswordConfirm}
        title="الخطوة الأخيرة: تأكيد الهوية"
        body="يرجى إدخال كلمة المرور الخاصة بك لتأكيد استبدال قاعدة البيانات وإعادة تشغيل التطبيق."
        showBackupKeyField
      />

    </Container>
  );
};

export default SettingsPage;
