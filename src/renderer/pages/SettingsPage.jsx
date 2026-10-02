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
import TransferKeyCard from '@renderer/components/settings/TransferKeyCard';

// The association transfer key, named for what it does for the user.
const BACKUP_KEY_LABEL = 'رمز حماية النسخ الاحتياطية (رمز النقل)';

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

  // Saves the settings now (all tabs). The backup tab's own buttons use it so staff do not have
  // to find «حفظ جميع التغييرات» at the bottom of the page.
  const saveSettings = async (nextSettings = settings) => {
    setIsSubmitting(true);
    try {
      const filteredSettings = { ...nextSettings };
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    await saveSettings();
  };

  // Choosing the backup folder saves it right away.
  const handleDirectorySelect = async (fieldName) => {
    const response = await window.electronAPI.openDirectoryDialog();
    if (response.success) {
      const nextSettings = { ...settings, [fieldName]: response.path };
      setSettings(nextSettings);
      await saveSettings(nextSettings);
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
        toast.success(
          'تم استيراد قاعدة البيانات بنجاح! سيتم إعادة تشغيل التطبيق لتطبيق التغييرات.',
          {
            autoClose: 3000,
            onClose: () => window.electronAPI.relaunchApp(),
          },
        );
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

  if (loading)
    return (
      <Container className="d-flex justify-content-center align-items-center vh-100">
        <Spinner animation="border" />
      </Container>
    );
  if (error)
    return (
      <Container>
        <Alert variant="danger">{error}</Alert>
      </Container>
    );

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
                <Tabs
                  activeKey={activeTab}
                  onSelect={(k) => setActiveTab(k)}
                  className="mb-4 custom-tabs"
                  fill
                >
                  <Tab eventKey="association" title="بيانات الجمعية/الفرع">
                    <Row>
                      <Col md={6}>
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
                          <Form.Label>اسم الفرع الجهوي</Form.Label>
                          <Form.Control
                            type="text"
                            name="regional_association_name"
                            value={settings.regional_association_name || ''}
                            onChange={handleChange}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
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
                      </Col>
                    </Row>
                  </Tab>

                  <Tab eventKey="branding" title="الهوية البصرية">
                    <Row>
                      <Col md={6}>
                        <Form.Group className="mb-4">
                          <Form.Label>شعار الجمعية الوطنية</Form.Label>
                          <InputGroup>
                            <Button
                              variant="outline-primary"
                              onClick={() => handleFileSelect('national_logo_path')}
                              disabled={isUploading === 'national_logo_path'}
                            >
                              {isUploading === 'national_logo_path' ? (
                                <Spinner size="sm" />
                              ) : (
                                'تحميل...'
                              )}
                            </Button>
                            <Form.Control
                              type="text"
                              value={settings.national_logo_path || ''}
                              readOnly
                            />
                          </InputGroup>
                          {settings.national_logo_path && (
                            <div className="mt-3 p-2 border rounded text-center bg-light">
                              <Image
                                src={`safe-image://${settings.national_logo_path}`}
                                style={{ maxHeight: '120px', maxWidth: '100%' }}
                              />
                            </div>
                          )}
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group className="mb-4">
                          <Form.Label>شعار الفرع المحلي</Form.Label>
                          <InputGroup>
                            <Button
                              variant="outline-primary"
                              onClick={() => handleFileSelect('regional_local_logo_path')}
                              disabled={isUploading === 'regional_local_logo_path'}
                            >
                              {isUploading === 'regional_local_logo_path' ? (
                                <Spinner size="sm" />
                              ) : (
                                'تحميل...'
                              )}
                            </Button>
                            <Form.Control
                              type="text"
                              value={settings.regional_local_logo_path || ''}
                              readOnly
                            />
                          </InputGroup>
                          {settings.regional_local_logo_path && (
                            <div className="mt-3 p-2 border rounded text-center bg-light">
                              <Image
                                src={`safe-image://${settings.regional_local_logo_path}`}
                                style={{ maxHeight: '120px', maxWidth: '100%' }}
                              />
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
                              <Form.Control
                                type="number"
                                name="annual_fee"
                                value={settings.annual_fee || ''}
                                onChange={handleChange}
                                min="0"
                                step="0.01"
                              />
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
                              <Form.Control
                                type="number"
                                name="standard_monthly_fee"
                                value={settings.standard_monthly_fee || ''}
                                onChange={handleChange}
                                min="0"
                                step="0.01"
                              />
                              <InputGroup.Text>د.ت</InputGroup.Text>
                            </InputGroup>
                            <Form.Text className="text-muted">
                              الرسم الشهري الذي سيتم تطبيقه على الطلاب المسجلين في الفصول.
                            </Form.Text>
                          </Form.Group>
                        </Col>
                      </Row>
                      <Alert variant="warning" className="mb-4">
                        <strong>تحذير مهم حول تغيير الرسوم:</strong>
                        <ul className="mb-0 mt-2">
                          <li>
                            تغيير الرسوم السنوية أو الشهرية <strong>لن يؤثر</strong> على الرسوم
                            المولدة مسبقاً
                          </li>
                          <li>الطلاب الذين دفعوا بالفعل لن يتأثروا بهذا التغيير</li>
                          <li>الرسوم الجديدة ستطبق فقط على الطلاب الجدد أو عند توليد رسوم جديدة</li>
                          <li>لضمان الاتساق، يُفضل تغيير الرسوم في بداية السنة الدراسية</li>
                        </ul>
                      </Alert>

                      <h6 className="mb-3">نظام الدفع</h6>
                      <p className="small text-muted mb-4">
                        يُحدَّد نظام الدفع (شهري أو سنوي) لكل فئة عمرية في تبويب «فئات عمرية»،
                        وتتبعه فصول تلك الفئة.
                      </p>
                      <p className="small text-muted mb-4">
                        يمكن أيضاً تحديد رسوم سنوية وشهرية خاصة بكل فئة عمرية؛ الرسوم أعلاه هي
                        الافتراضية للفئات التي لم تُحدَّد لها رسوم.
                      </p>

                      <h6 className="mb-3">إعدادات السنة الدراسية والتوليد التلقائي</h6>
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>شهر بداية السنة الدراسية</Form.Label>
                            <Form.Select
                              name="academic_year_start_month"
                              value={settings.academic_year_start_month || 9}
                              onChange={handleChange}
                            >
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
                            <Form.Control
                              type="number"
                              name="charge_generation_day"
                              value={settings.charge_generation_day || 25}
                              onChange={handleChange}
                              min="1"
                              max="28"
                            />
                            <Form.Text className="text-muted">
                              سيتم توليد رسوم الشهر القادم تلقائياً في هذا اليوم من كل شهر (افتراضي:
                              25)
                            </Form.Text>
                          </Form.Group>
                        </Col>
                      </Row>
                      <Alert variant="info" className="small py-2 mb-0">
                        <InfoIcon size={16} className="me-1 ms-1" />
                        <ul className="mb-0 mt-1">
                          <li>سيتم توليد الرسوم تلقائياً كل شهر. لا حاجة للتوليد اليدوي.</li>
                          <li>
                            عند تحديد الرسوم لأول مرة، سيتم إنشاء رسوم الشهر الحالي لجميع الطلاب.
                          </li>
                          <li>الخصومات الدائمة للطلاب ستطبق تلقائياً على جميع الرسوم.</li>
                        </ul>
                      </Alert>
                    </Card>
                  </Tab>

                  <Tab eventKey="age-groups" title="فئات عمرية">
                    <AgeGroupsTab />
                  </Tab>

                  <Tab eventKey="backup" title="النسخ الاحتياطي">
                    {/* 1. The association transfer key: set at first setup, shown and changed
                        by the Superadmin with their password */}
                    <TransferKeyCard
                      label={BACKUP_KEY_LABEL}
                      hasKey={!!settings.has_transfer_key}
                      canManage={!!user?.roles?.includes('Superadmin')}
                      onChanged={() => setSettings((prev) => ({ ...prev, has_transfer_key: true }))}
                    />

                    {/* 2. Making backups */}
                    <Card className="shadow-sm border mb-4" data-section="make-backup">
                      <Card.Body>
                        <h5 className="text-primary border-bottom pb-2 mb-2">حفظ نسخة احتياطية</h5>
                        <p className="small text-muted">
                          النسخة الاحتياطية ملف واحد (<bdi dir="ltr">.qdb</bdi>) يحتوي كل بيانات
                          الفرع، مشفّر ومحمي من التعديل. احفظها في مجلد على قرص آخر أو مفتاح USB، لا
                          على نفس القرص فقط.
                        </p>
                        <Form.Group className="mb-3">
                          <Form.Label className="small fw-bold">
                            مجلد حفظ النسخ الاحتياطية
                          </Form.Label>
                          <InputGroup size="sm">
                            <Button
                              variant="secondary"
                              onClick={() => handleDirectorySelect('backup_path')}
                            >
                              اختيار...
                            </Button>
                            <Form.Control
                              type="text"
                              value={settings.backup_path || ''}
                              placeholder="لم يتم اختيار مجلد بعد"
                              readOnly
                            />
                          </InputGroup>
                          <Form.Text className="text-muted small">
                            يُحفظ المجلد فور اختياره.
                          </Form.Text>
                        </Form.Group>

                        <Button
                          variant="success"
                          onClick={handleRunBackup}
                          disabled={isBackingUp || !settings.backup_path}
                        >
                          {isBackingUp ? <Spinner size="sm" /> : 'نسخ احتياطي الآن'}
                        </Button>
                        {!settings.backup_path && (
                          <span className="small text-muted ms-2">اختر مجلداً أولاً.</span>
                        )}

                        <div
                          className="mt-3 p-2 rounded border bg-light small"
                          data-section="last-backup"
                        >
                          {backupStatus ? (
                            <>
                              <div>
                                <strong>آخر نسخة احتياطية:</strong>{' '}
                                {new Date(backupStatus.timestamp).toLocaleString()} —{' '}
                                <span
                                  className={backupStatus.success ? 'text-success' : 'text-danger'}
                                >
                                  {backupStatus.success ? 'ناجحة' : 'فاشلة'}
                                </span>
                              </div>
                              {backupStatus.success && backupStatus.filePath && (
                                <div className="text-muted text-break" dir="ltr">
                                  {backupStatus.filePath}
                                </div>
                              )}
                              {!backupStatus.success && backupStatus.message && (
                                <div className="text-danger">{backupStatus.message}</div>
                              )}
                            </>
                          ) : (
                            <span className="text-muted">لم تُنشأ أي نسخة احتياطية بعد.</span>
                          )}
                        </div>

                        <hr />
                        <h6 className="mb-2">النسخ التلقائي</h6>
                        <Form.Check
                          type="switch"
                          id="backup-enabled-switch"
                          name="backup_enabled"
                          label="تفعيل النسخ التلقائي"
                          checked={settings.backup_enabled || false}
                          onChange={handleChange}
                          disabled={!settings.backup_path}
                          className="mb-2"
                        />
                        <p className="small text-muted mb-3">
                          {settings.backup_path
                            ? 'يعمل النسخ التلقائي فقط عندما يكون التطبيق مفتوحاً؛ إن كان مغلقاً وقت النسخ فسيُنفَّذ خلال ساعة من فتحه.'
                            : 'اختر مجلد الحفظ أولاً لتفعيل النسخ التلقائي.'}
                        </p>
                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label className="small">تكرار النسخ</Form.Label>
                              <Form.Select
                                size="sm"
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
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label className="small">توقيت النسخ</Form.Label>
                              <Form.Control
                                size="sm"
                                type="time"
                                name="backup_time"
                                value={settings.backup_time || '02:00'}
                                onChange={handleChange}
                                disabled={!settings.backup_enabled}
                              />
                            </Form.Group>
                          </Col>
                        </Row>
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={() => saveSettings()}
                          disabled={isSubmitting || !settings.backup_path}
                        >
                          حفظ إعدادات النسخ التلقائي
                        </Button>
                      </Card.Body>
                    </Card>

                    {/* 3. Restoring */}
                    <Card className="shadow-sm border border-danger mb-4" data-section="restore">
                      <Card.Body>
                        <h5 className="text-danger border-bottom pb-2 mb-2">
                          استرجاع نسخة احتياطية
                        </h5>
                        <Alert variant="danger" className="small">
                          الاسترجاع <strong>يستبدل كل البيانات الحالية</strong> ببيانات النسخة
                          (الطلاب، المالية، المستخدمون...) ثم يعيد تشغيل التطبيق. قبل الاستبدال
                          تُحفظ نسخة أمان من البيانات الحالية في مجلد النسخ الاحتياطية إن كان
                          محدداً.
                        </Alert>
                        <p className="small text-muted">
                          ستُطلب منك كلمة مرورك الحالية. النسخ المشفّرة بالرمز المحفوظ في هذا الجهاز
                          تُفتح مباشرة؛ اكتب «{BACKUP_KEY_LABEL}» فقط إذا كانت النسخة مشفّرة برمز
                          آخر (مثلاً رمز سابق).
                        </p>
                        <Button
                          variant="outline-danger"
                          onClick={() => handleImportDb()}
                          disabled={isImporting || isBackingUp}
                        >
                          استرجاع من نسخة احتياطية...
                        </Button>
                      </Card.Body>
                    </Card>
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
        body="أدخل كلمة مرورك الحالية لتأكيد استبدال كل البيانات بالنسخة المختارة. سيُعاد تشغيل التطبيق بعد الاسترجاع."
        showBackupKeyField
        backupKeyPlaceholder="رمز حماية النسخ الاحتياطية (اتركه فارغاً إذا كانت النسخة مشفّرة بالرمز المحفوظ هنا)"
      />
    </Container>
  );
};

export default SettingsPage;
