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
  Table,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import InfoIcon from '@renderer/components/icons/InfoIcon';
import CopyIcon from '@renderer/components/icons/CopyIcon';
import DownloadIcon from '@renderer/components/icons/DownloadIcon';
import TrashIcon from '@renderer/components/icons/TrashIcon';
import ExternalLinkIcon from '@renderer/components/icons/ExternalLinkIcon';
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
  const [isUploading, setIsUploading] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showCloudHelp, setShowCloudHelp] = useState(false);
  const [activeTab, setActiveTab] = useState(state?.defaultTab || 'association');
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(null); // id of backup to delete
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(null); // backup object to restore

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

          fetchCloudBackups();
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

  const fetchCloudBackups = async () => {
    setIsLoadingCloudBackups(true);
    try {
      const backups = await window.electronAPI.listCloudBackups();
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
      const response = await window.electronAPI.runBackup({
        ...settings,
        backup_path: settings.backup_path,
      });
      if (response.success) {
        toast.success(response.message);
        const statusResponse = await window.electronAPI.getBackupStatus();
        if (statusResponse.success) {
          setBackupStatus(statusResponse.status);
        }
        fetchCloudBackups();
      } else {
        toast.error(response.message);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleCopyLink = (link) => {
    navigator.clipboard.writeText(link);
    toast.success('تم نسخ الرابط إلى الحافظة.');
  };

  const handleDeleteCloudBackup = async () => {
    const id = showDeleteModal;
    setShowDeleteModal(null);
    try {
      await window.electronAPI.deleteCloudBackup(id);
      toast.success('تم حذف النسخة بنجاح.');
      fetchCloudBackups();
    } catch (err) {
      toast.error(`فشل الحذف: ${err.message}`);
    }
  };

  const handleRestoreFromCloud = async () => {
    const backup = showRestoreConfirm;
    setShowRestoreConfirm(null);

    setIsDownloading(true);
    toast.info('جارٍ تحميل النسخة من Google Drive وفك ضغطها...');
    try {
      const filePath = await window.electronAPI.downloadCloudBackup(backup.driveFileId, backup.name);
      toast.success('تم التحميل والتحقق بنجاح. يرجى تأكيد هويتك للمتابعة في الاستبدال.');
      setShowPasswordModal(filePath);
    } catch (err) {
      toast.error(`فشل التحميل: ${err.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePasswordConfirm = async (password) => {
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

  const handleConnectGoogle = async () => {
    setIsConnectingGoogle(true);
    try {
      const result = await window.electronAPI.connectGoogle();
      if (result.success) {
        setSettings({
          ...settings,
          google_connected: true,
          google_account_email: result.email,
        });
        toast.success(`تم الربط بحساب ${result.email} بنجاح.`);
        fetchCloudBackups();
      }
    } catch (err) {
      toast.error(`فشل الربط: ${err.message}`);
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      await window.electronAPI.disconnectGoogle();
      setSettings({
        ...settings,
        google_connected: false,
        google_account_email: '',
      });
      setCloudBackups([]);
      toast.info('تم إلغاء الربط بحساب Google.');
    } catch (err) {
      toast.error(`فشل إلغاء الربط: ${err.message}`);
    }
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
                      <Row>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>الرسم السنوي (د.ت)</Form.Label>
                            <Form.Control type="number" name="annual_fee" value={settings.annual_fee || ''} onChange={handleChange} step="0.01" />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group className="mb-3">
                            <Form.Label>الرسم الشهري (د.ت)</Form.Label>
                            <Form.Control type="number" name="standard_monthly_fee" value={settings.standard_monthly_fee || ''} onChange={handleChange} step="0.01" />
                          </Form.Group>
                        </Col>
                      </Row>
                      <Alert variant="info" className="small py-2 mb-0">
                        <InfoIcon size={16} className="me-1 ms-1" /> يتم استخدام هذه القيم لحساب مطالبات الطلاب تلقائياً.
                      </Alert>
                    </Card>
                  </Tab>

                  <Tab eventKey="age-groups" title="فئات عمرية">
                    <AgeGroupsTab />
                  </Tab>

                  <Tab eventKey="backup" title="النسخ الاحتياطي">
                    <Row>
                      <Col lg={5}>
                        <Card className="h-100 shadow-none border">
                          <Card.Body>
                            <h6>الإعدادات المحلية</h6>
                            <Form.Group className="mb-3">
                              <Form.Label className="small text-muted">مسار حفظ النسخ الاحتياطي</Form.Label>
                              <InputGroup size="sm">
                                <Button variant="secondary" onClick={() => handleDirectorySelect('backup_path')}>اختيار...</Button>
                                <Form.Control type="text" value={settings.backup_path || ''} readOnly />
                              </InputGroup>
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
                            <div className="d-grid gap-2">
                              <Button variant="info" size="sm" onClick={handleRunBackup} disabled={isBackingUp || !settings.backup_path}>
                                {isBackingUp ? <Spinner size="sm" className="me-2" /> : 'نسخ احتياطي فوري الآن'}
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

                      <Col lg={7}>
                        <Card className="h-100 shadow-none border">
                          <Card.Body>
                            <div className="d-flex justify-content-between align-items-center mb-3">
                              <h6>النسخ السحابي (Google Drive)</h6>
                              <Button variant="link" className="p-0 text-info" onClick={() => setShowCloudHelp(true)} title="كيفية الربط والاشتراك؟"><InfoIcon size={18} /></Button>
                            </div>

                            <div className="mb-4">
                              {!settings.google_connected ? (
                                <div className="text-center p-3 border rounded bg-light">
                                  <p className="small text-muted mb-3">اربط حساب Gmail الخاص بالفرع لمشاركة النسخ بين الأجهزة.</p>
                                  <Button variant="outline-danger" size="sm" onClick={handleConnectGoogle} disabled={isConnectingGoogle}>
                                    {isConnectingGoogle ? <Spinner size="sm" /> : <Image src="https://www.google.com/favicon.ico" width={14} className="me-2 ms-2" />}
                                    ربط حساب Google
                                  </Button>
                                </div>
                              ) : (
                                <div className="p-2 border rounded bg-light d-flex justify-content-between align-items-center">
                                  <div className="small overflow-hidden text-nowrap">
                                    <span className="badge bg-success me-2 ms-2">متصل</span>
                                    <strong>{settings.google_account_email}</strong>
                                  </div>
                                  <Button variant="link" size="sm" className="text-muted p-0" onClick={handleDisconnectGoogle}>إلغاء</Button>
                                </div>
                              )}
                            </div>

                            <Form.Check type="switch" label="رفع تلقائي للسحابة عند كل نسخة ناجحة" name="cloud_backup_enabled" checked={settings.cloud_backup_enabled || false} onChange={handleChange} disabled={!settings.google_connected} className="mb-3 small" />

                            <div className="d-flex justify-content-between align-items-center mb-2 border-top pt-3">
                              <h6 className="mb-0 small font-weight-bold">تاريخ النسخ السحابية</h6>
                              <Button variant="link" size="sm" className="p-0" onClick={fetchCloudBackups} disabled={isLoadingCloudBackups}>
                                {isLoadingCloudBackups ? <Spinner size="sm" /> : 'تحديث'}
                              </Button>
                            </div>

                            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                              <Table hover responsive size="sm" className="small align-middle">
                                <thead className="table-light sticky-top">
                                  <tr>
                                    <th>التاريخ</th>
                                    <th>الحجم</th>
                                    <th>الإجراءات</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cloudBackups.length === 0 ? (
                                    <tr><td colSpan="3" className="text-center py-4 text-muted">لا توجد نسخ سحابية.</td></tr>
                                  ) : (
                                    cloudBackups.map(backup => (
                                      <tr key={backup.id} className={backup.status === 'pending' ? 'table-warning' : ''}>
                                        <td>
                                          {new Date(backup.createdAt).toLocaleString()}
                                          {backup.status === 'pending' && <span className="badge bg-warning text-dark ms-2 ms-2">انتظار</span>}
                                        </td>
                                        <td>{(backup.size / 1024 / 1024).toFixed(2)} MB</td>
                                        <td>
                                          <div className="d-flex gap-2 justify-content-end">
                                            <Button variant="outline-primary" size="sm" className="p-1" title="استرجاع" onClick={() => setShowRestoreConfirm(backup)} disabled={isDownloading || backup.status === 'pending'}><DownloadIcon size={16} /></Button>
                                            <Button variant="outline-info" size="sm" className="p-1" title="نسخ رابط المشاركة" onClick={() => handleCopyLink(backup.shareableLink)} disabled={backup.status === 'pending'}><CopyIcon size={16} /></Button>
                                            <Button variant="outline-danger" size="sm" className="p-1" title="حذف" onClick={() => setShowDeleteModal(backup.id)}><TrashIcon size={16} /></Button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </Table>
                            </div>
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

      {/* Delete Confirmation Modal */}
      <Modal show={!!showDeleteModal} onHide={() => setShowDeleteModal(null)} centered>
        <Modal.Header closeButton className="bg-danger text-white">
          <Modal.Title size="sm">تأكيد حذف النسخة الاحتياطية</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center py-4">
          <TrashIcon size={48} className="text-danger mb-3" />
          <p>هل أنت متأكد من رغبتك في حذف هذه النسخة الاحتياطية من Google Drive ومن سجل التطبيق؟</p>
          <p className="text-muted small">هذا الإجراء لا يمكن التراجع عنه.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(null)}>إلغاء</Button>
          <Button variant="danger" onClick={handleDeleteCloudBackup}>حذف نهائي</Button>
        </Modal.Footer>
      </Modal>

      {/* Restore Confirmation Modal */}
      <Modal show={!!showRestoreConfirm} onHide={() => setShowRestoreConfirm(null)} centered>
        <Modal.Header closeButton className="bg-warning text-dark">
          <Modal.Title>تنبيه: استرجاع قاعدة بيانات</Modal.Title>
        </Modal.Header>
        <Modal.Body className="py-4">
          <div className="text-center mb-3">
             <ExternalLinkIcon size={48} className="text-warning mb-2" />
          </div>
          <Alert variant="danger">
            <strong>⚠️ تحذير شديد:</strong> سيتم استبدال جميع البيانات الحالية بالبيانات الموجودة في النسخة المختارة. جميع التغييرات غير المحفوظة في السحابة ستضيع للأبد.
          </Alert>
          <div className="p-3 border rounded bg-light small mt-3">
            <strong>تفاصيل النسخة:</strong><br />
            - التاريخ: {showRestoreConfirm && new Date(showRestoreConfirm.createdAt).toLocaleString()}<br />
            - المالك: {showRestoreConfirm && showRestoreConfirm.createdBy}<br />
            - الحجم: {showRestoreConfirm && (showRestoreConfirm.size / 1024 / 1024).toFixed(2)} MB
          </div>
          <p className="mt-3">هل تود المتابعة؟ سيطلب منك إدخال كلمة المرور للتأكيد النهائي.</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRestoreConfirm(null)}>إلغاء</Button>
          <Button variant="warning" onClick={handleRestoreFromCloud}>تحميل واسترجاع</Button>
        </Modal.Footer>
      </Modal>

      <PasswordPromptModal
        show={!!showPasswordModal}
        onHide={() => setShowPasswordModal(false)}
        onConfirm={handlePasswordConfirm}
        title="الخطوة الأخيرة: تأكيد الهوية"
        body="يرجى إدخال كلمة المرور الخاصة بك لتأكيد استبدال قاعدة البيانات وإعادة تشغيل التطبيق."
      />

      {/* Help Modal */}
      <Modal show={showCloudHelp} onHide={() => setShowCloudHelp(false)} centered size="lg">
        <Modal.Header closeButton className="bg-info text-white">
          <Modal.Title>دليل مشاركة البيانات سحابياً</Modal.Title>
        </Modal.Header>
        <Modal.Body dir="rtl">
          <h5>كيف يعمل النسخ السحابي؟</h5>
          <p>تم تصميم هذا النظام لتمكين فروع الجمعية من مزامنة البيانات يدوياً عبر Google Drive دون الحاجة لخوادم مركزية.</p>
          <ol>
            <li className="mb-3">
              <strong>حساب Google:</strong> ننصح بإنشاء حساب Gmail مخصص للفرع. اربط التطبيق بهذا الحساب في جميع أجهزتكم.
            </li>
            <li className="mb-3">
              <strong>الرفع (Upload):</strong> عند تفعيل "الرفع التلقائي"، يتم ضغط قاعدة البيانات ورفعها للسحابة عند كل نسخة احتياطية.
            </li>
            <li className="mb-3">
              <strong>المشاركة (Share):</strong> يمكنك نسخ "رابط المشاركة" وإرساله لمسؤول آخر. الرابط دائم ولا تنتهي صلاحيته.
            </li>
            <li className="mb-3">
              <strong>الاسترجاع (Restore):</strong> في الحاسوب الآخر، ابحث عن النسخة في القائمة واضغط "استرجاع". سيقوم التطبيق بتحميلها، فك ضغطها، استبدال البيانات المحلية، ثم إعادة التشغيل تلقائياً.
            </li>
          </ol>
          <Alert variant="warning">
            <strong>تنبيه:</strong> SQLite لا يدعم المزامنة اللحظية. لذا يجب أن يتفق فريق العمل على أن يقوم شخص واحد فقط بإدخال البيانات في وقت واحد، ثم يرفع النسخة، ويقوم الآخرون باسترجاعها قبل البدء بعملهم.
          </Alert>
          <Alert variant="danger" className="mt-3">
            <strong>أمن البيانات:</strong> رابط المشاركة يمنح صلاحية القراءة لأي شخص يملكه. لا تشارك الرابط إلا مع الأشخاص الموثوق بهم في الجمعية.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCloudHelp(false)}>فهمت ذلك</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default SettingsPage;
