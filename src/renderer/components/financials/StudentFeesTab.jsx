import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Card,
  Row,
  Col,
  Alert,
  Spinner,
  Badge,
  Modal,
  Form,
  InputGroup,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import SummaryCard from '@renderer/components/financial/SummaryCard';
import TablePagination from '@renderer/components/common/TablePagination';
import ExportModal from '@renderer/components/modals/ExportModal';
import ImportModal from '@renderer/components/modals/ImportModal';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { PERMISSIONS } from '@renderer/utils/permissions';
import { error as logError } from '@renderer/utils/logger';
import ExportIcon from '@renderer/components/icons/ExportIcon';
import ImportIcon from '@renderer/components/icons/ImportIcon';
import SearchIcon from '@renderer/components/icons/SearchIcon';
import { getFeeTypeLabel, getFeeStatusLabel } from '@renderer/utils/feeTypes';

const studentFeesFields = [
  { key: 'name', label: 'الاسم' },
  { key: 'totalDue', label: 'إجمالي المستحق' },
  { key: 'totalPaid', label: 'إجمالي المدفوع' },
  { key: 'balance', label: 'المبلغ المتبقي' },
  { key: 'status', label: 'الحالة' },
];

const studentPaymentFields = [
  { key: 'student_matricule', label: 'رقم التعريفي' },
  { key: 'student_name', label: 'اسم الطالب' },
  { key: 'amount', label: 'المبلغ' },
  { key: 'payment_date', label: 'تاريخ الدفع' },
  { key: 'payment_method', label: 'طريقة الدفع' },
  { key: 'payment_type', label: 'نوع الدفعة' },
  { key: 'class_matricule', label: 'رقم تعريفي الفصل' },
  { key: 'academic_year', label: 'السنة الدراسية' },
  { key: 'receipt_number', label: 'رقم الوصل' },
  { key: 'check_number', label: 'رقم الشيك' },
  { key: 'notes', label: 'ملاحظات' },
  { key: 'sponsor_name', label: 'اسم الكافل' },
  { key: 'sponsor_phone', label: 'هاتف الكافل' },
];

const getAcademicYearString = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

const StudentFeesTab = () => {
  const { hasPermission } = usePermissions();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feesConfigured, setFeesConfigured] = useState(true);
  const [showChargesModal, setShowChargesModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  // Payment type removed - system determines automatically
  const [receiptNumber, setReceiptNumber] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [specialFeeClasses, setSpecialFeeClasses] = useState([]);
  const [selectedSpecialFeeClass, setSelectedSpecialFeeClass] = useState('');
  const [academicYear, setAcademicYear] = useState(getAcademicYearString());
  const [notes, setNotes] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('ALL'); // ALL, PAID, PARTIAL, UNPAID, EXEMPT
  const [searchTerm, setSearchTerm] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showGenerateFeesModal, setShowGenerateFeesModal] = useState(false);
  const [generateAcademicYear, setGenerateAcademicYear] = useState(getAcademicYearString());
  const [forceGeneration, setForceGeneration] = useState(false);
  const [isGeneratingFees, setIsGeneratingFees] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [isResettingFees, setIsResettingFees] = useState(false);
  const [resetAcademicYear, setResetAcademicYear] = useState(getAcademicYearString());
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  const loadAccounts = async () => {
    try {
      const accs = await window.electronAPI.getAccounts();
      if (Array.isArray(accs) && accs.length > 0) {
        setAccounts(accs);
        setSelectedAccountId(accs[0].id.toString());
      }
    } catch (err) {
      console.error('[StudentFeesTab] Error loading accounts:', err);
    }
  };

  useEffect(() => {
    loadStudents();
    checkFeesConfiguration();
    loadAccounts();

    // Listen for settings updates to refresh charges
    const handleSettingsUpdated = () => {
      setTimeout(() => {
        loadStudents();
        checkFeesConfiguration();
      }, 1000);
    };

    window.addEventListener('settings-updated', handleSettingsUpdated);

    return () => {
      window.removeEventListener('settings-updated', handleSettingsUpdated);
    };
  }, []);

  const checkFeesConfiguration = async () => {
    try {
      const res = await window.electronAPI.getSettings();
      const annual = parseFloat(res.settings.annual_fee || 0);
      const monthly = parseFloat(res.settings.standard_monthly_fee || 0);
      setFeesConfigured(annual > 0 || monthly > 0);
    } catch (err) {
      console.error('Failed to check fees configuration:', err);
    }
  };

  // Listen for import completion events to refresh data
  useEffect(() => {
    const handleImportCompleted = (payload) => {
      // Check if student fees data was imported
      if (payload.sheets && payload.sheets.includes('رسوم الطلاب')) {
        loadStudents();
      }
    };

    const unsubscribe = window.electronAPI.onImportCompleted(handleImportCompleted);

    return unsubscribe;
  }, []);

  // Helper functions
  const getStudentPaymentStatus = (student) => {
    const { balance, totalPaid, totalDue, fee_category } = student;

    if (fee_category === 'EXEMPT') {
      return 'EXEMPT';
    }

    if (balance <= 0) {
      return 'PAID';
    }

    if (totalPaid > 0 && totalPaid < totalDue) {
      return 'PARTIAL';
    }

    return 'UNPAID';
  };

  const getStatusBadge = (student) => {
    const status = getStudentPaymentStatus(student);
    const hasCredit = student.totalCredit > 0;

    switch (status) {
      case 'PAID':
        return <Badge bg="success">مدفوع {hasCredit && '+ رصيد'}</Badge>;
      case 'PARTIAL':
        return <Badge bg="warning">جزئياً مدفوع</Badge>;
      case 'UNPAID':
        return <Badge bg="danger">غير مدفوع</Badge>;
      case 'EXEMPT':
        return <Badge bg="secondary">معفى</Badge>;
      default:
        return <Badge bg="secondary">غير محدد</Badge>;
    }
  };

  const isPaymentDisabled = (student) => {
    const status = getStudentPaymentStatus(student);
    return status === 'EXEMPT';
  };

  // Filter students based on search term and payment status filter
  const getFilteredStudents = () => {
    return students.filter((student) => {
      // Search filter - case insensitive search by name
      const matchesSearch =
        searchTerm === '' || student.name.toLowerCase().includes(searchTerm.toLowerCase());

      // Payment status filter
      const status = getStudentPaymentStatus(student);
      let matchesStatus = true;

      switch (paymentStatusFilter) {
        case 'PAID':
          matchesStatus = status === 'PAID';
          break;
        case 'PARTIAL':
          matchesStatus = status === 'PARTIAL';
          break;
        case 'UNPAID':
          matchesStatus = status === 'UNPAID';
          break;
        case 'EXEMPT':
          matchesStatus = status === 'EXEMPT';
          break;
        case 'ALL':
        default:
          matchesStatus = true;
          break;
      }

      return matchesSearch && matchesStatus;
    });
  };

  const loadStudents = async () => {
    try {
      setLoading(true);
      const studentsWithFees = await window.electronAPI.studentFeesGetAll(academicYear);
      setStudents(studentsWithFees);
      setCurrentPage(1);
    } catch (err) {
      console.error('[StudentFeesTab] Error loading students:', err);
      setError('Failed to load students.');
    } finally {
      setLoading(false);
    }
  };

  // Get filtered students and pagination
  const filteredStudents = getFilteredStudents();
  const indexOfLastStudent = currentPage * itemsPerPage;
  const indexOfFirstStudent = indexOfLastStudent - itemsPerPage;
  const currentStudents = filteredStudents.slice(indexOfFirstStudent, indexOfLastStudent);
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newPageSize) => {
    setItemsPerPage(10); // Reset to 10 for now, keep fixed
    setCurrentPage(1);
  };

  const handleRecordPayment = async () => {
    if (!selectedStudent || !paymentAmount || !receiptNumber) {
      toast.error('يرجى ملء جميع الحقول الإلزامية.');
      return;
    }

    try {
      const paymentDetails = {
        student_id: selectedStudent.id,
        amount: parseFloat(paymentAmount),
        payment_method: paymentMethod,
        payment_type: 'CUSTOM', // Payment type is now automatic
        notes: notes,
        academic_year: academicYear,
        receipt_number: receiptNumber,
        ...(selectedAccountId && { account_id: parseInt(selectedAccountId, 10) }),
        ...(paymentMethod === 'CHECK' && checkNumber && { check_number: checkNumber }),
        ...(selectedSpecialFeeClass && { class_id: selectedSpecialFeeClass }),
        ...(selectedStudent.fee_category === 'SPONSORED' && {
          sponsor_name: selectedStudent.sponsor_name,
          sponsor_phone: selectedStudent.sponsor_phone,
        }),
      };

      await window.electronAPI.studentFeesRecordPayment(paymentDetails);

      toast.success('تم تسجيل الدفعة بنجاح');
      setShowPaymentModal(false);
      // Reset all form fields
      setPaymentAmount('');
      setPaymentMethod('CASH');
      setReceiptNumber('');
      setCheckNumber('');
      setAcademicYear(getAcademicYearString());
      setNotes('');
      setSelectedSpecialFeeClass('');
      loadStudents(); // Refresh the list
    } catch (err) {
      const errorMessage = err.message || 'فشل في تسجيل الدفعة. يرجى المحاولة مرة أخرى.';
      toast.error(errorMessage);
    }
  };

  const refreshPaymentHistory = async (student) => {
    try {
      const history = await window.electronAPI.studentFeesGetPaymentHistory(
        student.id,
        academicYear,
      );
      setPaymentHistory(history || []);
    } catch (err) {
      toast.error('فشل في تحميل سجل الدفعات');
    }
  };

  const handleDeletePayment = async (payment) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الدفعة؟ سيتم عكس كل الأرصدة والرسوم.')) {
      return;
    }
    try {
      await window.electronAPI.studentFeesDeletePayment(payment.id);
      toast.success('تم حذف الدفعة بنجاح');
      if (selectedStudent) {
        await refreshPaymentHistory(selectedStudent);
        loadStudents(); // Refresh the list
      }
    } catch (err) {
      toast.error(err.message || 'فشل في حذف الدفعة');
    }
  };

  const handleRefundPayment = async (payment) => {
    if (
      !window.confirm(
        'هل أنت متأكد من استرجاع هذه الدفعة؟ سيتم عكس الأرصدة والرسوم وتسجيل حركة استرجاع.',
      )
    ) {
      return;
    }
    try {
      await window.electronAPI.studentFeesRefundPayment(payment.id);
      toast.success('تم استرجاع الدفعة بنجاح');
      if (selectedStudent) {
        await refreshPaymentHistory(selectedStudent);
        loadStudents(); // Refresh the list
      }
    } catch (err) {
      toast.error(err.message || 'فشل في استرجاع الدفعة');
    }
  };

  const handleGenerateFees = () => {
    setShowGenerateFeesModal(true);
  };

  const handleConfirmGenerateFees = async () => {
    try {
      setIsGeneratingFees(true);
      setShowGenerateFeesModal(false);

      const result = await window.electronAPI.studentFeesGenerateAllCharges(
        generateAcademicYear,
        forceGeneration,
      );

      if (result.success) {
        toast.success(result.message);
        loadStudents(); // Refresh the data
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      const errorMessage = err.message || 'فشل في توليد الرسوم.';
      toast.error(errorMessage);
    } finally {
      setIsGeneratingFees(false);
    }
  };

  const handleResetFees = async () => {
    try {
      setIsResettingFees(true);
      setShowResetConfirmModal(false);

      const result = await window.electronAPI.studentFeesResetCharges(resetAcademicYear);

      if (result.success) {
        toast.success(result.message);
        loadStudents(); // Refresh the data
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      const errorMessage = err.message || 'فشل في إعادة ضبط الرسوم.';
      toast.error(errorMessage);
    } finally {
      setIsResettingFees(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center">
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <>
      {!feesConfigured && (
        <Alert variant="warning" className="mb-3">
          <strong>⚠️ لم يتم تحديد الرسوم بعد.</strong> يرجى تحديد الرسوم في{' '}
          <Alert.Link href="#/settings">إعدادات الرسوم</Alert.Link>
        </Alert>
      )}
      {error && (
        <Alert variant="danger" onClose={() => setError(null)} dismissible className="mb-3">
          {error}
        </Alert>
      )}
      <Card className="mb-4">
        <Card.Header>
          <Row className="align-items-center">
            <Col>
              <h5 className="mb-0">إدارة رسوم الطلاب</h5>
            </Col>
            <Col xs="auto">
              <div className="d-flex align-items-center gap-2">
                {hasPermission(PERMISSIONS.FINANCIALS_MANAGE) && (
                  <>
                    <Button
                      variant="outline-success"
                      onClick={handleGenerateFees}
                      disabled={isGeneratingFees}
                    >
                      {isGeneratingFees ? 'جاري التوليد...' : '⚡ توليد الرسوم'}
                    </Button>
                    <Button
                      variant="outline-danger"
                      onClick={() => setShowResetConfirmModal(true)}
                      disabled={isResettingFees}
                    >
                      {isResettingFees ? 'جاري إعادة الضبط...' : '🔄 إعادة ضبط الرسوم'}
                    </Button>
                  </>
                )}
                {hasPermission(PERMISSIONS.FINANCIALS_VIEW) && (
                  <Button variant="outline-primary" onClick={() => setShowExportModal(true)}>
                    <ExportIcon className="ms-2" /> تصدير البيانات
                  </Button>
                )}
                <Button variant="primary" onClick={loadStudents}>
                  تحديث
                </Button>
              </div>
            </Col>
          </Row>
        </Card.Header>
        <Card.Body>
          {students.length > 0 && (
            <>
              <Row className="mb-4">
                <SummaryCard
                  title="عدد الطلاب المسددين"
                  value={students.filter((s) => getStudentPaymentStatus(s) === 'PAID').length}
                  variant="success"
                  suffix=""
                />
                <SummaryCard
                  title="الطلاب الذين دفعوا جزئياً"
                  value={students.filter((s) => getStudentPaymentStatus(s) === 'PARTIAL').length}
                  variant="warning"
                  suffix=""
                />
                <SummaryCard
                  title="الطلاب غير المسددين"
                  value={students.filter((s) => getStudentPaymentStatus(s) === 'UNPAID').length}
                  variant="danger"
                  suffix=""
                />
                <SummaryCard
                  title="الطلاب المعفيين"
                  value={students.filter((s) => getStudentPaymentStatus(s) === 'EXEMPT').length}
                  variant="secondary"
                  suffix=""
                />
              </Row>
            </>
          )}
          {students.length === 0 ? (
            <Alert variant="info">لا توجد طلاب لعرضهم.</Alert>
          ) : (
            <>
              {/* Search and Filter Bar */}
              <div className="d-flex gap-3 mb-4 align-items-center">
                <div className="flex-grow-1">
                  <InputGroup className="search-input-group">
                    <InputGroup.Text>
                      <SearchIcon />
                    </InputGroup.Text>
                    <Form.Control
                      type="search"
                      placeholder="البحث بالاسم..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1); // Reset to first page when search changes
                      }}
                    />
                  </InputGroup>
                </div>
                <div style={{ minWidth: '160px' }}>
                  <Form.Select
                    value={paymentStatusFilter}
                    onChange={(e) => {
                      setPaymentStatusFilter(e.target.value);
                      setCurrentPage(1); // Reset to first page when filter changes
                    }}
                    style={{ width: '160px' }}
                    className="filter-select"
                  >
                    <option value="ALL">الجميع</option>
                    <option value="PAID">مدفوع</option>
                    <option value="PARTIAL">جزئياً مدفوع</option>
                    <option value="UNPAID">غير مدفوع</option>
                    <option value="EXEMPT">معفى</option>
                  </Form.Select>
                </div>
              </div>
              <Table responsive striped hover>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>إجمالي المستحق</th>
                    <th>إجمالي المدفوع</th>
                    <th>المبلغ المتبقي</th>
                    <th>الحالة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {currentStudents.map((student) => (
                    <tr key={student.id}>
                      <td>{student.name}</td>
                      <td>{student.totalDue?.toFixed(2) || 0} د.ت</td>
                      <td>{student.totalPaid?.toFixed(2) || 0} د.ت</td>
                      <td>
                        {student.balance >= 0 ? (
                          <span className="text-danger fw-bold">
                            {student.balance?.toFixed(2)} د.ت
                          </span>
                        ) : (
                          <span className="text-success fw-bold">
                            +{Math.abs(student.balance)?.toFixed(2)} د.ت
                          </span>
                        )}
                      </td>
                      <td>{getStatusBadge(student)}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="info"
                          className="me-2"
                          onClick={async () => {
                            const balanceSummary =
                              await window.electronAPI.studentFeesGetBalanceSummary(student.id);
                            setSelectedStudent({ ...student, balanceSummary });
                            setShowChargesModal(true);
                          }}
                          title="عرض التفاصيل"
                        >
                          👁️
                        </Button>
                        <Button
                          size="sm"
                          variant="success"
                          disabled={isPaymentDisabled(student)}
                          onClick={async () => {
                            setSelectedStudent(student);
                            const history = await window.electronAPI.studentFeesGetPaymentHistory(
                              student.id,
                              academicYear,
                            );
                            setPaymentHistory(history);
                            const specialClasses =
                              await window.electronAPI.studentFeesGetClassesWithSpecialFees(
                                student.id,
                              );
                            const classesWithMatricules = specialClasses.map((cls) => ({
                              ...cls,
                              matricule: cls.matricule || `C-${cls.id.toString().padStart(4, '0')}`,
                            }));
                            setSpecialFeeClasses(classesWithMatricules);
                            setShowPaymentModal(true);
                          }}
                        >
                          تسجيل دفعة
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredStudents.length}
                pageSize={itemsPerPage}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </>
          )}
        </Card.Body>
      </Card>

      {/* Payment Modal */}
      <Modal show={showPaymentModal} onHide={() => setShowPaymentModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>تسجيل دفعة جديدة</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedStudent && (
            <div className="mb-4 p-3 bg-light rounded">
              <Row>
                <Col md={6}>
                  <p className="mb-1">
                    <strong>الطالب:</strong> {selectedStudent.name}
                  </p>
                </Col>
                <Col md={6}>
                  <p className="mb-1">
                    <strong>
                      {selectedStudent.balance >= 0 ? 'المبلغ المستحق:' : 'رصيد متاح:'}
                    </strong>{' '}
                    <span
                      className={
                        selectedStudent.balance >= 0
                          ? 'text-danger fw-bold'
                          : 'text-success fw-bold'
                      }
                    >
                      {Math.abs(selectedStudent.balance)?.toFixed(2) || 0} د.ت
                    </span>
                  </p>
                </Col>
              </Row>
            </div>
          )}

          {selectedStudent && selectedStudent.fee_category === 'SPONSORED' && (
            <Alert variant="info" className="mb-4">
              <h6 className="alert-heading">طالب مكفول</h6>
              <hr />
              <Row>
                <Col md={6}>
                  <strong>اسم الكافل:</strong> {selectedStudent.sponsor_name || 'غير محدد'}
                </Col>
                <Col md={6}>
                  <strong>هاتف الكافل:</strong> {selectedStudent.sponsor_phone || 'غير محدد'}
                </Col>
              </Row>
            </Alert>
          )}

          <Form>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>المبلغ *</Form.Label>
                  <InputGroup>
                    <Form.Control
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      step="0.01"
                      min="0"
                      required
                    />
                    <InputGroup.Text>د.ت</InputGroup.Text>
                  </InputGroup>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>طريقة الدفع *</Form.Label>
                  <Form.Select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    required
                  >
                    <option value="CASH">نقدي</option>
                    <option value="CHECK">شيك</option>
                    <option value="TRANSFER">تحويل بنكي</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            {paymentMethod === 'CHECK' && (
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>رقم الشيك *</Form.Label>
                    <Form.Control
                      type="text"
                      value={checkNumber}
                      onChange={(e) => setCheckNumber(e.target.value)}
                      placeholder="أدخل رقم الشيك"
                      required
                    />
                  </Form.Group>
                </Col>
              </Row>
            )}

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>رقم الوصل *</Form.Label>
                  <Form.Control
                    type="text"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder="أدخل رقم الوصل"
                    required
                  />
                  <Form.Text className="text-muted">
                    يجب أن يكون رقم الوصل فريداً عبر جميع عمليات الدفع
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>الحساب المالي (الخزينة)</Form.Label>
                  <Form.Select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>ملاحظات</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أضف ملاحظات إضافية (اختياري)"
              />
            </Form.Group>
          </Form>

          <hr />
          <h6 className="mb-3">سجل الدفعات السابقة</h6>
          {paymentHistory.length === 0 ? (
            <p className="text-muted">لا توجد دفعات مسجلة لهذا الطالب.</p>
          ) : (
            <Table striped bordered hover responsive size="sm">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>المبلغ</th>
                  <th>الطريقة</th>
                  <th>رقم الوصل</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.payment_date}</td>
                    <td>{Number(payment.amount).toFixed(2)} د.ت</td>
                    <td>{payment.payment_method}</td>
                    <td>{payment.receipt_number || '-'}</td>
                    <td>
                      {payment.refunded ? (
                        <Badge bg="warning">مسترجع</Badge>
                      ) : (
                        <Badge bg="success">مؤكدة</Badge>
                      )}
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="warning"
                        className="me-1"
                        disabled={!!payment.refunded}
                        onClick={() => handleRefundPayment(payment)}
                      >
                        استرجاع
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={!!payment.refunded}
                        onClick={() => handleDeletePayment(payment)}
                      >
                        حذف
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowPaymentModal(false)}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            onClick={handleRecordPayment}
            disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || !receiptNumber}
          >
            تسجيل الدفعة
          </Button>
        </Modal.Footer>
      </Modal>

      <ExportModal
        show={showExportModal}
        handleClose={() => setShowExportModal(false)}
        exportType="student-fees"
        fields={studentPaymentFields}
        title="تصدير رسوم الطلاب"
      />

      <ImportModal
        show={showImportModal}
        handleClose={() => setShowImportModal(false)}
        importType="رسوم الطلاب"
        title="استيراد رسوم الطلاب"
      />

      {/* Charges Details Modal */}
      <Modal show={showChargesModal} onHide={() => setShowChargesModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>تفاصيل الرسوم</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedStudent && selectedStudent.balanceSummary && (
            <>
              <div className="mb-4 p-3 bg-light rounded">
                <Row>
                  <Col md={4}>
                    <p className="mb-1">
                      <strong>الطالب:</strong> {selectedStudent.name}
                    </p>
                  </Col>
                  <Col md={4}>
                    <p className="mb-1">
                      <strong>{selectedStudent.balanceSummary.displayLabel}:</strong>{' '}
                      <span className={selectedStudent.balanceSummary.displayClass}>
                        {selectedStudent.balanceSummary.displayAmount?.toFixed(2) || 0} د.ت
                      </span>
                    </p>
                  </Col>
                  {/* Show credit info only if they have credit */}
                  {selectedStudent.balanceSummary.displayType === 'owed' &&
                    selectedStudent.balanceSummary.totalCredit > 0 && (
                      <Col md={4}>
                        <p className="mb-1">
                          <strong>رصيد متاح:</strong>{' '}
                          <span className="text-success fw-bold">
                            {selectedStudent.balanceSummary.totalCredit?.toFixed(2) || 0} د.ت
                          </span>
                        </p>
                      </Col>
                    )}
                </Row>
              </div>

              {selectedStudent.fee_category === 'SPONSORED' && (
                <Alert variant="info" className="mb-3">
                  <h6 className="alert-heading">طالب مكفول</h6>
                  <hr />
                  <Row>
                    <Col md={6}>
                      <strong>اسم الكافل:</strong> {selectedStudent.sponsor_name || 'غير محدد'}
                    </Col>
                    <Col md={6}>
                      <strong>هاتف الكافل:</strong> {selectedStudent.sponsor_phone || 'غير محدد'}
                    </Col>
                  </Row>
                </Alert>
              )}

              {/* Show credit alert for students with credit */}
              {selectedStudent.balanceSummary.totalCredit > 0 &&
                selectedStudent.balanceSummary.displayType === 'owed' && (
                  <Alert variant="info" className="mb-3">
                    <strong>رصيد مدفوع مسبقاً:</strong>{' '}
                    {selectedStudent.balanceSummary.totalCredit.toFixed(2)} د.ت
                    <br />
                    <small>سيتم تطبيق هذا الرصيد تلقائياً على الرسوم القادمة</small>
                  </Alert>
                )}

              {selectedStudent.balanceSummary.charges &&
              selectedStudent.balanceSummary.charges.length > 0 ? (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  <Table striped bordered hover>
                    <thead
                      style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1 }}
                    >
                      <tr>
                        <th>النوع</th>
                        <th>الوصف</th>
                        <th>المبلغ</th>
                        <th>المدفوع</th>
                        <th>المتبقي</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStudent.balanceSummary.charges
                        .filter((charge) => charge.fee_type !== 'CREDIT')
                        .map((charge) => {
                          const remaining = charge.amount - charge.amount_paid;
                          const statusVariant =
                            charge.status === 'PAID'
                              ? 'success'
                              : charge.status === 'PARTIALLY_PAID'
                                ? 'warning'
                                : 'danger';
                          const statusLabel =
                            charge.status === 'PAID'
                              ? 'مدفوع'
                              : charge.status === 'PARTIALLY_PAID'
                                ? 'جزئياً'
                                : 'غير مدفوع';
                          return (
                            <tr key={charge.id}>
                              <td>{charge.fee_type === 'ANNUAL' ? 'سنوي' : 'شهري'}</td>
                              <td>{charge.description}</td>
                              <td>{(charge.amount?.toFixed(2) || 0) + ' د.ت'}</td>
                              <td>{charge.amount_paid?.toFixed(2)} د.ت</td>
                              <td
                                className={remaining > 0 ? 'text-danger fw-bold' : 'text-success'}
                              >
                                {remaining > 0 ? remaining?.toFixed(2) + ' د.ت' : '-'}
                              </td>
                              <td>
                                <Badge bg={statusVariant}>{statusLabel}</Badge>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                    <tfoot>
                      <tr
                        className="table-secondary"
                        style={{ position: 'sticky', bottom: 0, zIndex: 1 }}
                      >
                        <td colSpan="2" className="text-end fw-bold">
                          المجموع:
                        </td>
                        <td className="fw-bold">
                          {selectedStudent.balanceSummary.totalDue?.toFixed(2)} د.ت
                        </td>
                        <td className="fw-bold">
                          {selectedStudent.balanceSummary.totalPaid?.toFixed(2)} د.ت
                        </td>
                        <td
                          className={`fw-bold ${selectedStudent.balanceSummary.balance >= 0 ? 'text-danger' : 'text-success'}`}
                        >
                          {selectedStudent.balanceSummary.balance?.toFixed(2)} د.ت
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </Table>
                </div>
              ) : (
                <Alert variant="info">لا توجد رسوم لهذا الطالب.</Alert>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowChargesModal(false)}>
            إغلاق
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Generate Fees Modal */}
      <Modal show={showGenerateFeesModal} onHide={() => setShowGenerateFeesModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>توليد رسوم الطلاب</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="info">
            سيتم توليد الرسوم السنوية والشهرية للطلاب المسجلين للسنة الدراسية المحددة.
          </Alert>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>السنة الدراسية</Form.Label>
              <Form.Control
                type="text"
                value={generateAcademicYear}
                onChange={(e) => setGenerateAcademicYear(e.target.value)}
                placeholder="مثال: 2024-2025"
              />
              <Form.Text className="text-muted">اتركه فارغاً لاستخدام السنة الحالية</Form.Text>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="إعادة التوليد حتى لو كانت الرسوم موجودة مسبقاً"
                checked={forceGeneration}
                onChange={(e) => setForceGeneration(e.target.checked)}
              />
              <Form.Text className="text-muted">
                استخدم هذا الخيار بحذر - قد يؤدي إلى إنشاء رسوم مكررة
              </Form.Text>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowGenerateFeesModal(false)}>
            إلغاء
          </Button>
          <Button variant="success" onClick={handleConfirmGenerateFees}>
            توليد الرسوم
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Reset Fees Confirmation Modal */}
      <Modal show={showResetConfirmModal} onHide={() => setShowResetConfirmModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>⚠️ تأكيد إعادة ضبط الرسوم</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="danger">
            <strong>تحذير: هذا الإجراء سيحذف جميع الرسوم غير المدفوعة والمكررة!</strong>
          </Alert>
          <p>
            سيتم القيام بالآتي:
          </p>
          <ul>
            <li>حذف جميع الرسوم غير المدفوعة (amount_paid = 0)</li>
            <li>حذف الرسوم المكررة</li>
            <li>إعادة توليد رسوم نظيفة للطلاب النشطين</li>
          </ul>
          <p className="text-muted">
            لن يتم حذف الرسوم التي تم دفعها بالفعل. هذا الإجراء آمن للبيانات المالية المدفوعة.
          </p>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>السنة الدراسية</Form.Label>
              <Form.Control
                type="text"
                value={resetAcademicYear}
                onChange={(e) => setResetAcademicYear(e.target.value)}
                placeholder="مثال: 2024-2025"
              />
              <Form.Text className="text-muted">
                استخدم "ALL" لإعادة ضبط جميع السنوات الدراسية
              </Form.Text>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowResetConfirmModal(false)}>
            إلغاء
          </Button>
          <Button variant="danger" onClick={handleResetFees} disabled={isResettingFees}>
            {isResettingFees ? 'جاري إعادة الضبط...' : 'تأكيد إعادة الضبط'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default StudentFeesTab;
