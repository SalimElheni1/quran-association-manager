import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@renderer/contexts/AuthContext';
import { error, log } from '@renderer/utils/logger';
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
  Modal,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FiHelpCircle } from 'react-icons/fi';
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
  const [isDownloading, setIsDownloading] = useState(false);
  const [cloudBackups, setCloudBackups] = useState([]);
  const [isLoadingCloudBackups, setIsLoadingCloudBackups] = useState(false);
  const [isUploading, setIsUploading] = useState(null); // Can be 'national' or 'regional'
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showCloudHelp, setShowCloudHelp] = useState(false);
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

          if (loadedSettings && loadedSettings.cloud_association_key) {
            fetchCloudBackups(loadedSettings);
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

  const fetchCloudBackups = async (currentSettings) => {
    const settingsToUse = currentSettings || settings;
    if (!settingsToUse?.cloud_association_key) return;

    setIsLoadingCloudBackups(true);
    try {
      const backups = await window.electronAPI.listCloudBackups(settingsToUse);
      setCloudBackups(backups || []);
    } catch (err) {
      log('Failed to fetch cloud backups:', err);
    } finally {
      setIsLoadingCloudBackups(false);
    }
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
      const filteredSettings = { ...settings };
      delete filteredSettings.adultAgeThreshold;
      delete filteredSettings.adult_age_threshold;
      log('[SettingsPage] Submitting settings:', filteredSettings);
      const response = await window.electronAPI.updateSettings(filteredSettings);
      log('[SettingsPage] Response:', response);
      if (response.success) {
        toast.success(response.message, { autoClose: 5000 });
        // Emit event to notify other components
        window.dispatchEvent(new Event('settings-updated'));
      } else {
        toast.error(response.message);
      }
    } catch (err) {
      error('[SettingsPage] Error:', err);
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRunBackup = async () => {
    setIsBackingUp(true);
    toast.info('بدء عملية النسخ الاحتياطي...');
    try {
      const response = await window.electronAPI.runBackup({
        backup_path: settings.backup_path,
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

  const handleImportDb = (filePath = null) => {
    // If filePath is provided, we are importing a downloaded cloud backup
    setShowPasswordModal(filePath || true);
  };

  const handlePasswordConfirm = async (password) => {
    const downloadedFilePath = typeof showPasswordModal === 'string' ? showPasswordModal : null;
    setShowPasswordModal(false);

    if (!password) {
      toast.warn('تم إلغاء عملية الاستيراد.');
      return;
    }

    setIsImporting(true);
    toast.info('بدء عملية استيراد قاعدة البيانات...');

    try {
      let result;
      if (downloadedFilePath) {
        // Special internal import for downloaded cloud backup
        // For now, we reuse the importDatabase but we might need a way to pass the path
        // Actually, the current importDatabase opens a dialog.
        // I need a new IPC handler for importing from a specific path.
        result = await window.electronAPI.importDatabase({
          password,
          userId: user.id,
          filePath: downloadedFilePath,
        });
      } else {
        result = await window.electronAPI.importDatabase({ password, userId: user.id });
      }

      if (result.success) {
        toast.success(result.message, { autoClose: false });
      } else {
        toast.error(`فشل الاستيراد: ${result.message}`);
      }
    } catch (err) {
      toast.error(`حدث خطأ فادح: ${err.message}`);
      error(err);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadCloudBackup = async (fileName) => {
    setIsDownloading(true);
    toast.info('جارٍ تحميل النسخة من السحابة...');
    try {
      const filePath = await window.electronAPI.downloadCloudBackup(fileName, settings);
      toast.success('تم التحميل بنجاح. يرجى تأكيد الهوية للمتابعة في الاستيراد.');
      handleImportDb(filePath);
    } catch (err) {
      toast.error(`فشل التحميل: ${err.message}`);
    } finally {
      setIsDownloading(false);
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
                          <Form.Label>اسم الفرع الجهوي</Form.Label>
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
                                log('Failed to load image:', settings.national_logo_path);
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
                        <h6>إعدادات الرسوم الدراسية</h6>
                        <Form.Group as={Row} className="mb-3">
                          <Form.Label column sm={4}>
                            الرسوم السنوية
                          </Form.Label>
                          <Col sm={8}>
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
                          </Col>
                        </Form.Group>
                        <Form.Group as={Row} className="mb-3">
                          <Form.Label column sm={4}>
                            الرسوم الشهرية
                          </Form.Label>
                          <Col sm={8}>
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
                          </Col>
                        </Form.Group>
                        <Alert variant="warning" className="mb-3">
                          <strong>⚠️ تحذير مهم حول تغيير الرسوم:</strong>
                          <ul className="mb-0 mt-2">
                            <li>
                              تغيير الرسوم السنوية أو الشهرية <strong>لن يؤثر</strong> على الرسوم
                              المولدة مسبقاً
                            </li>
                            <li>الطلاب الذين دفعوا بالفعل لن يتأثروا بهذا التغيير</li>
                            <li>
                              الرسوم الجديدة ستطبق فقط على الطلاب الجدد أو عند توليد رسوم جديدة
                            </li>
                            <li>لضمان الاتساق، يُفضل تغيير الرسوم في بداية السنة الدراسية</li>
                          </ul>
                        </Alert>
                        <hr />
                        <h6>نظام الدفع حسب نوع الفصل</h6>
                        <Form.Group as={Row} className="mb-3">
                          <Form.Label column sm={4}>
                            نظام الدفع للرجال
                          </Form.Label>
                          <Col sm={8}>
                            <Form.Select
                              name="men_payment_frequency"
                              value={settings.men_payment_frequency || 'MONTHLY'}
                              onChange={handleChange}
                            >
                              <option value="MONTHLY">شهري (يدفع كل شهر)</option>
                              <option value="ANNUAL">سنوي (يدفع مرة واحدة للسنة)</option>
                            </Form.Select>
                            <Form.Text className="text-muted">
                              يطبق على الطلاب المسجلين في فصول الرجال
                            </Form.Text>
                          </Col>
                        </Form.Group>
                        <Form.Group as={Row} className="mb-3">
                          <Form.Label column sm={4}>
                            نظام الدفع للنساء
                          </Form.Label>
                          <Col sm={8}>
                            <Form.Select
                              name="women_payment_frequency"
                              value={settings.women_payment_frequency || 'MONTHLY'}
                              onChange={handleChange}
                            >
                              <option value="MONTHLY">شهري (يدفع كل شهر)</option>
                              <option value="ANNUAL">سنوي (يدفع مرة واحدة للسنة)</option>
                            </Form.Select>
                            <Form.Text className="text-muted">
                              يطبق على الطلاب المسجلين في فصول النساء
                            </Form.Text>
                          </Col>
                        </Form.Group>
                        <Form.Group as={Row} className="mb-3">
                          <Form.Label column sm={4}>
                            نظام الدفع للأطفال
                          </Form.Label>
                          <Col sm={8}>
                            <Form.Select
                              name="kids_payment_frequency"
                              value={settings.kids_payment_frequency || 'MONTHLY'}
                              onChange={handleChange}
                            >
                              <option value="MONTHLY">شهري (يدفع كل شهر)</option>
                              <option value="ANNUAL">سنوي (يدفع مرة واحدة للسنة)</option>
                            </Form.Select>
                            <Form.Text className="text-muted">
                              يطبق على الطلاب المسجلين في فصول الأطفال
                            </Form.Text>
                          </Col>
                        </Form.Group>
                        <hr />
                        <h6>إعدادات السنة الدراسية والتوليد التلقائي</h6>
                        <Form.Group as={Row} className="mb-3">
                          <Form.Label column sm={4}>
                            شهر بداية السنة الدراسية
                          </Form.Label>
                          <Col sm={8}>
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
                          </Col>
                        </Form.Group>
                        <Form.Group as={Row} className="mb-3">
                          <Form.Label column sm={4}>
                            يوم توليد رسوم الشهر القادم
                          </Form.Label>
                          <Col sm={8}>
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
                          </Col>
                        </Form.Group>
                        <Alert variant="info" className="mt-3">
                          <strong>ℹ️ معلومة هامة:</strong>
                          <ul className="mb-0 mt-2">
                            <li>سيتم توليد الرسوم تلقائياً كل شهر. لا حاجة للتوليد اليدوي.</li>
                            <li>
                              عند تحديد الرسوم لأول مرة، سيتم إنشاء رسوم الشهر الحالي لجميع الطلاب.
                            </li>
                            <li>الخصومات الدائمة للطلاب ستطبق تلقائياً على جميع الرسوم.</li>
                          </ul>
                        </Alert>
                      </Card.Body>
                    </Card>
                  </Tab>
                  <Tab eventKey="age-groups" title="فئات عمرية">
                    <AgeGroupsTab />
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
                        <hr />
                        <div className="d-flex align-items-center mt-4 mb-2">
                          <h5 className="mb-0">النسخ الاحتياطي السحابي (Cloud)</h5>
                          <Button
                            variant="link"
                            className="p-0 ms-2 text-info"
                            onClick={() => setShowCloudHelp(true)}
                            title="كيفية الحصول على المفاتيح؟"
                          >
                            <FiHelpCircle size={20} />
                          </Button>
                        </div>
                        <Form.Group className="mb-3">
                          <Form.Check
                            type="switch"
                            id="cloud-backup-enabled-switch"
                            label="تفعيل النسخ الاحتياطي السحابي"
                            name="cloud_backup_enabled"
                            checked={settings.cloud_backup_enabled || false}
                            onChange={handleChange}
                          />
                          <Form.Text className="text-muted">
                            عند التفعيل، سيتم رفع نسخة من قاعدة البيانات إلى السحابة تلقائياً عند كل
                            عملية نسخ احتياطي.
                          </Form.Text>
                        </Form.Group>

                        <Row>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>معرف الجمعية السحابي (Association Key)</Form.Label>
                              <Form.Control
                                type="text"
                                name="cloud_association_key"
                                value={settings.cloud_association_key || ''}
                                onChange={handleChange}
                                placeholder="مثال: ASSOC-12345"
                              />
                            </Form.Group>
                          </Col>
                          <Col md={6}>
                            <Form.Group className="mb-3">
                              <Form.Label>المفتاح السري (Secret Key)</Form.Label>
                              <Form.Control
                                type="password"
                                name="cloud_secret_key"
                                value={settings.cloud_secret_key || ''}
                                onChange={handleChange}
                              />
                            </Form.Group>
                          </Col>
                        </Row>

                        {settings.cloud_association_key && (
                          <div className="mt-3">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <h6>النسخ المتوفرة في السحابة</h6>
                              <Button
                                variant="outline-primary"
                                size="sm"
                                onClick={() => fetchCloudBackups()}
                                disabled={isLoadingCloudBackups}
                              >
                                {isLoadingCloudBackups ? <Spinner size="sm" /> : 'تحديث القائمة'}
                              </Button>
                            </div>
                            <div
                              className="border rounded p-2 bg-light"
                              style={{ maxHeight: '200px', overflowY: 'auto' }}
                            >
                              {cloudBackups.length === 0 ? (
                                <p className="text-center text-muted my-3">
                                  لا توجد نسخ احتياطية في السحابة حالياً.
                                </p>
                              ) : (
                                <ul className="list-group list-group-flush">
                                  {cloudBackups.map((backup, index) => (
                                    <li
                                      key={index}
                                      className="list-group-item bg-transparent d-flex justify-content-between align-items-center"
                                    >
                                      <div>
                                        <strong>{new Date(backup.timestamp).toLocaleString()}</strong>
                                        <br />
                                        <small className="text-muted">
                                          الجهاز: {backup.deviceName} | الحجم:{' '}
                                          {(backup.size / 1024 / 1024).toFixed(2)} MB
                                        </small>
                                      </div>
                                      <Button
                                        variant="outline-success"
                                        size="sm"
                                        onClick={() => handleDownloadCloudBackup(backup.fileName)}
                                        disabled={isDownloading || isImporting}
                                      >
                                        {isDownloading ? <Spinner size="sm" /> : 'استيراد'}
                                      </Button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}

                        <hr />
                        <div className="mt-3">
                          <h5 className="text-danger">منطقة الخطر</h5>
                          <p>
                            استيراد قاعدة بيانات سيستبدل جميع البيانات الحالية. سيتم أخذ نسخة
                            احتياطية من بياناتك الحالية قبل المتابعة.
                          </p>
                          <Button
                            variant="danger"
                            onClick={() => handleImportDb()}
                            disabled={isImporting || isBackingUp || isDownloading}
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

      <Modal show={showCloudHelp} onHide={() => setShowCloudHelp(false)} centered size="lg">
        <Modal.Header closeButton className="bg-info text-white">
          <Modal.Title>دليل الحصول على مفاتيح الربط السحابي</Modal.Title>
        </Modal.Header>
        <Modal.Body dir="rtl">
          <h5>كيف أحصل على معرف الجمعية والمفتاح السري؟</h5>
          <p>للحصول على بيانات الربط السحابي، يرجى اتباع الخطوات التالية:</p>
          <ol>
            <li className="mb-2">
              <strong>التواصل مع الإدارة المركزية:</strong> قم بالاتصال بقسم المعلوماتية في الرابطة
              الوطنية للقرآن الكريم.
            </li>
            <li className="mb-2">
              <strong>تزويد بيانات الفرع:</strong> سيُطلب منك تزويد اسم الفرع المحلي والمعرف الخاص
              به (Matricule) الموجود في صفحة بيانات الجمعية.
            </li>
            <li className="mb-2">
              <strong>استلام المفاتيح:</strong> ستتلقى ملفاً يحتوي على "معرف الجمعية السحابي"
              و"المفتاح السري" الخاص بفرعكم فقط.
            </li>
            <li className="mb-2">
              <strong>تفعيل المزامنة:</strong> قم بإدخال هذه المفاتيح في هذه الصفحة وتفعيل خيار "النسخ
              الاحتياطي السحابي".
            </li>
          </ol>
          <Alert variant="warning">
            <strong>تنبيه أمني:</strong> لا تقم بمشاركة "المفتاح السري" مع أي شخص خارج إدارة الفرع،
            فهو يمنح الوصول الكامل لنسخ قاعدة البيانات الخاصة بكم في السحابة.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCloudHelp(false)}>
            إغلاق
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default SettingsPage;
