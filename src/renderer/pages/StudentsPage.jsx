import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Badge, Form, InputGroup, Tabs, Tab } from 'react-bootstrap';
import { toast } from 'react-toastify';
import StudentFormModal from '@renderer/components/StudentFormModal';
import ConfirmationModal from '@renderer/components/common/ConfirmationModal';
import StudentDetailsModal from '@renderer/components/StudentDetailsModal';
import SelectionModal from '@renderer/components/SelectionModal';
import TablePagination from '@renderer/components/common/TablePagination';
// Placeholder for the new component
import GroupsTabContent from '@renderer/components/GroupsTabContent';
import '@renderer/styles/StudentsPage.css';
import { error as logError } from '@renderer/utils/logger';
import GroupFormModal from '../components/GroupFormModal';
import PlusIcon from '@renderer/components/icons/PlusIcon';
import SearchIcon from '@renderer/components/icons/SearchIcon';
import EditIcon from '@renderer/components/icons/EditIcon';
import TrashIcon from '@renderer/components/icons/TrashIcon';
import EyeIcon from '@renderer/components/icons/EyeIcon';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { PERMISSIONS } from '@renderer/utils/permissions';

function StudentsPage() {
  const { hasPermission } = usePermissions();
  const [activeTab, setActiveTab] = useState('students');

  // Student-related state
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [minAgeFilter, setMinAgeFilter] = useState('');
  const [maxAgeFilter, setMaxAgeFilter] = useState('');
  const [surahFilter, setSurahFilter] = useState([]);
  const [hizbFilter, setHizbFilter] = useState([]);
  const [allSurahs, setAllSurahs] = useState([]);
  const [allHizbs, setAllHizbs] = useState([]);
  const [pendingSurahFilter, setPendingSurahFilter] = useState([]);
  const [pendingHizbFilter, setPendingHizbFilter] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [studentToView, setStudentToView] = useState(null);

  // Filter modal states
  const [showSurahFilterModal, setShowSurahFilterModal] = useState(false);
  const [showHizbFilterModal, setShowHizbFilterModal] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, genderFilter, minAgeFilter, maxAgeFilter, surahFilter, hizbFilter]);

  // Initialize pending filters with current active filters when modal opens
  useEffect(() => {
    if (showSurahFilterModal) {
      setPendingSurahFilter([...surahFilter]);
    }
  }, [showSurahFilterModal, surahFilter]);

  useEffect(() => {
    if (showHizbFilterModal) {
      setPendingHizbFilter([...hizbFilter]);
    }
  }, [showHizbFilterModal, hizbFilter]);

  // Filter modal handlers
  const handleSurahFilterChange = (selectedSurahs) => {
    setPendingSurahFilter(selectedSurahs);
  };

  const handleHizbFilterChange = (selectedHizbs) => {
    setPendingHizbFilter(selectedHizbs);
  };

  const handleSurahFilterSave = () => {
    setSurahFilter(pendingSurahFilter);
    setShowSurahFilterModal(false);
  };

  const handleHizbFilterSave = () => {
    setHizbFilter(pendingHizbFilter);
    setShowHizbFilterModal(false);
  };

  const handleSurahFilterCancel = () => {
    setPendingSurahFilter(surahFilter);
    setShowSurahFilterModal(false);
  };

  const handleHizbFilterCancel = () => {
    setPendingHizbFilter(hizbFilter);
    setShowHizbFilterModal(false);
  };

  // State for Group Modals
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [showGroupDeleteModal, setShowGroupDeleteModal] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [refreshGroups, setRefreshGroups] = useState(false);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {
        searchTerm,
        genderFilter,
        minAgeFilter,
        maxAgeFilter,
        surahIds: Array.isArray(surahFilter) ? surahFilter : surahFilter ? [surahFilter] : [],
        hizbIds: Array.isArray(hizbFilter) ? hizbFilter : hizbFilter ? [hizbFilter] : [],
        page: currentPage,
        limit: pageSize,
      };
      const result = await window.electronAPI.getStudents(filters);
      if (result && result.students) {
        setStudents(result.students);
        setTotalStudents(result.total);
        setTotalPages(result.totalPages);
      } else {
        // Fallback for old API response format
        setStudents(result);
        setTotalStudents(result.length);
        setTotalPages(1);
      }
    } catch (err) {
      logError('Error fetching students:', err);
      toast.error('فشل تحميل بيانات الطلاب. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [
    searchTerm,
    genderFilter,
    minAgeFilter,
    maxAgeFilter,
    surahFilter,
    hizbFilter,
    currentPage,
    pageSize,
  ]);

  useEffect(() => {
    const fetchFilterData = async () => {
      try {
        const surahsData = await window.electronAPI.getSurahs();
        setAllSurahs(surahsData);

        const hizbsData = await window.electronAPI.getHizbs();
        setAllHizbs(hizbsData);
      } catch (err) {
        console.error('Error loading filter data:', err);
        toast.error('فشل تحميل بيانات التصفية.');
      }
    };

    if (activeTab === 'students') {
      fetchStudents();
      fetchFilterData();
    }
  }, [activeTab, fetchStudents]);

  const handleShowAddModal = () => {
    setEditingStudent(null);
    setShowModal(true);
  };

  const handleShowEditModal = async (student) => {
    try {
      const fullStudent = await window.electronAPI.getStudentById(student.id);
      setEditingStudent(fullStudent);
      setShowModal(true);
    } catch (err) {
      logError('Error fetching full student details:', err);
      toast.error('فشل تحميل التفاصيل الكاملة للطالب.');
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingStudent(null);
  };

  const handleShowDetailsModal = async (student) => {
    try {
      const fullStudent = await window.electronAPI.getStudentById(student.id);
      setStudentToView(fullStudent);
      setShowDetailsModal(true);
    } catch (err) {
      logError('Error fetching full student details:', err);
      toast.error('فشل تحميل التفاصيل الكاملة للطالب.');
    }
  };

  const handleCloseDetailsModal = () => {
    setStudentToView(null);
    setShowDetailsModal(false);
  };

  const handleSaveStudent = async (formData, studentId) => {
    try {
      if (studentId) {
        await window.electronAPI.updateStudent(studentId, formData);
        toast.success(`تم تحديث بيانات الطالب "${formData.name}" بنجاح!`);
      } else {
        await window.electronAPI.addStudent(formData);
        toast.success(`تمت إضافة الطالب "${formData.name}" بنجاح!`);
      }
      fetchStudents(); // Refresh the list
      handleCloseModal();
    } catch (err) {
      logError('Error saving student:', err);
      const friendlyMessage = err.message.split('Error:').pop().trim();
      toast.error(friendlyMessage);
    }
  };

  const handleDeleteRequest = (student) => {
    setStudentToDelete(student);
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setStudentToDelete(null);
    setShowDeleteModal(false);
  };

  const confirmDelete = async () => {
    if (!studentToDelete) return;

    try {
      await window.electronAPI.deleteStudent(studentToDelete.id);
      toast.success(`تم حذف الطالب "${studentToDelete.name}" بنجاح.`);
      fetchStudents(); // Refresh the list
    } catch (err) {
      logError('Error deleting student:', err);
      toast.error(`فشل حذف الطالب "${studentToDelete.name}".`);
    } finally {
      handleCloseDeleteModal();
    }
  };

  // --- Group Handlers ---
  const handleShowAddGroupModal = () => {
    setEditingGroup(null);
    setShowGroupModal(true);
  };

  const handleShowEditGroupModal = (group) => {
    setEditingGroup(group);
    setShowGroupModal(true);
  };

  const handleCloseGroupModal = () => {
    setShowGroupModal(false);
    setEditingGroup(null);
  };

  const handleSaveGroup = async (formData, groupId) => {
    try {
      let result;
      if (groupId) {
        result = await window.electronAPI.updateGroup(groupId, formData);
        if (result.success) toast.success(`تم تحديث المجموعة "${formData.name}" بنجاح!`);
      } else {
        result = await window.electronAPI.addGroup(formData);
        if (result.success) toast.success(`تمت إضافة المجموعة "${formData.name}" بنجاح!`);
      }

      if (result.success) {
        setRefreshGroups((prev) => !prev); // Toggle to trigger refetch in child
        handleCloseGroupModal();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      logError('Error saving group:', err);
      toast.error(err.message || 'فشل حفظ المجموعة.');
    }
  };

  const handleDeleteGroupRequest = (group) => {
    setGroupToDelete(group);
    setShowGroupDeleteModal(true);
  };

  const handleCloseGroupDeleteModal = () => {
    setGroupToDelete(null);
    setShowGroupDeleteModal(false);
  };

  const confirmGroupDelete = async () => {
    if (!groupToDelete) return;

    try {
      const result = await window.electronAPI.deleteGroup(groupToDelete.id);
      if (result.success) {
        toast.success(`تم حذف المجموعة "${groupToDelete.name}" بنجاح.`);
        setRefreshGroups((prev) => !prev); // Toggle to trigger refetch in child
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      logError('Error deleting group:', err);
      toast.error(`فشل حذف المجموعة "${groupToDelete.name}".`);
    } finally {
      handleCloseGroupDeleteModal();
    }
  };

  const calculateAge = (dob) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const renderStatusBadge = (status) => {
    const translations = { active: 'نشط', inactive: 'غير نشط' };
    const variants = { active: 'success', inactive: 'secondary' };
    return (
      <Badge bg={variants[status] || 'light'} text="dark" className="p-2">
        {translations[status] || status}
      </Badge>
    );
  };

  const renderStudentsTab = () => (
    <>
      <div className="filter-bar">
        <InputGroup className="search-input-group">
          <InputGroup.Text>
            <SearchIcon />
          </InputGroup.Text>
          <Form.Control
            type="search"
            placeholder="البحث بالاسم أو الرقم التعريفي..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </InputGroup>
        <div className="filter-controls">
          <Form.Select
            aria-label="Filter by gender"
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">الجنس (الكل)</option>
            <option value="Male">ذكر</option>
            <option value="Female">أنثى</option>
          </Form.Select>
          <Form.Control
            type="number"
            placeholder="العمر (من)"
            value={minAgeFilter}
            onChange={(e) => setMinAgeFilter(e.target.value)}
            className="age-filter-input"
          />
          <Form.Control
            type="number"
            placeholder="العمر (إلى)"
            value={maxAgeFilter}
            onChange={(e) => setMaxAgeFilter(e.target.value)}
            className="age-filter-input"
          />
          <div style={{ marginLeft: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <Form.Label style={{ fontSize: '14px', fontWeight: 'bold', margin: '0' }}>
              تصفية حسب السور
            </Form.Label>
            <Button
              variant="outline-primary"
              size="sm"
              onClick={() => setShowSurahFilterModal(true)}
              style={{
                fontSize: '12px',
                padding: '5px 10px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {surahFilter.length > 0 ? `${surahFilter.length} سورة محددة` : 'اختر السور...'}
            </Button>
          </div>
          <div style={{ marginLeft: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <Form.Label style={{ fontSize: '14px', fontWeight: 'bold', margin: '0' }}>
              تصفية حسب الحزب
            </Form.Label>
            <Button
              variant="outline-primary"
              size="sm"
              onClick={() => setShowHizbFilterModal(true)}
              style={{
                fontSize: '12px',
                padding: '5px 10px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {hizbFilter.length > 0 ? `${hizbFilter.length} حزب محدد` : 'اختر الأحزاب...'}
            </Button>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="text-center">
          <Spinner animation="border" />
        </div>
      ) : (
        <div>
          <Table striped bordered hover responsive className="students-table">
            <thead>
              <tr>
                <th>#</th>
                <th>الرقم التعريفي</th>
                <th>الاسم واللقب</th>
                <th>العمر</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {students.length > 0 ? (
                students.map((student, index) => (
                  <tr key={student.id}>
                    <td>{(currentPage - 1) * pageSize + index + 1}</td>
                    <td>{student.matricule}</td>
                    <td>{student.name}</td>
                    <td>{calculateAge(student.date_of_birth) ?? 'غير متوفر'}</td>
                    <td>{renderStatusBadge(student.status)}</td>
                    <td className="table-actions d-flex gap-2">
                      <Button
                        variant="outline-info"
                        size="sm"
                        onClick={() => handleShowDetailsModal(student)}
                      >
                        <EyeIcon />
                      </Button>
                      {hasPermission(PERMISSIONS.STUDENTS_EDIT) && (
                        <Button
                          variant="outline-success"
                          size="sm"
                          onClick={() => handleShowEditModal(student)}
                        >
                          <EditIcon />
                        </Button>
                      )}
                      {hasPermission(PERMISSIONS.STUDENTS_DELETE) && (
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => handleDeleteRequest(student)}
                        >
                          <TrashIcon />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="text-center">
                    {searchTerm || genderFilter !== 'all' || minAgeFilter || maxAgeFilter
                      ? 'لا توجد نتائج تطابق معايير البحث.'
                      : 'لا يوجد طلاب مسجلون حالياً.'}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>

          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalStudents}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newPageSize, newPage) => {
              setPageSize(newPageSize);
              setCurrentPage(newPage);
            }}
          />
        </div>
      )}
    </>
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>شؤون الطلاب</h1>
        {activeTab === 'students' && hasPermission(PERMISSIONS.STUDENTS_CREATE) && (
          <Button variant="primary" onClick={handleShowAddModal}>
            <PlusIcon className="ms-2" /> إضافة طالب
          </Button>
        )}
        {activeTab === 'groups' && hasPermission(PERMISSIONS.STUDENTS_CREATE) && (
          <Button variant="primary" onClick={handleShowAddGroupModal}>
            <PlusIcon className="ms-2" /> إضافة مجموعة
          </Button>
        )}
      </div>

      <Tabs
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k)}
        id="students-tabs"
        className="mb-3"
      >
        <Tab eventKey="students" title="الطلاب">
          {renderStudentsTab()}
        </Tab>
        <Tab eventKey="groups" title="المجموعات">
          <GroupsTabContent
            onEditGroup={handleShowEditGroupModal}
            onDeleteGroup={handleDeleteGroupRequest}
            refreshDependency={refreshGroups}
          />
        </Tab>
      </Tabs>

      <StudentFormModal
        show={showModal}
        handleClose={handleCloseModal}
        onSave={handleSaveStudent}
        student={editingStudent}
      />

      <StudentDetailsModal
        show={showDetailsModal}
        handleClose={handleCloseDetailsModal}
        student={studentToView}
      />

      <ConfirmationModal
        show={showDeleteModal}
        handleClose={handleCloseDeleteModal}
        handleConfirm={confirmDelete}
        title="تأكيد حذف الطالب"
        body={`هل أنت متأكد من رغبتك في حذف الطالب "${studentToDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />

      <GroupFormModal
        show={showGroupModal}
        handleClose={handleCloseGroupModal}
        onSave={handleSaveGroup}
        group={editingGroup}
      />

      <ConfirmationModal
        show={showGroupDeleteModal}
        handleClose={handleCloseGroupDeleteModal}
        handleConfirm={confirmGroupDelete}
        title="تأكيد حذف المجموعة"
        body={`هل أنت متأكد من رغبتك في حذف المجموعة "${groupToDelete?.name}"؟ سيتم أيضًا إزالة جميع الطلاب من هذه المجموعة.`}
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />

      {/* Filter Modals */}
      <SelectionModal
        show={showSurahFilterModal}
        handleClose={handleSurahFilterCancel}
        title="اختر السور"
        items={allSurahs.map((surah) => ({
          value: surah.id,
          label: `${surah.id} - ${surah.name_ar}`,
        }))}
        selectedItems={pendingSurahFilter}
        onSelectionChange={handleSurahFilterChange}
        onSave={handleSurahFilterSave}
      />

      <SelectionModal
        show={showHizbFilterModal}
        handleClose={handleHizbFilterCancel}
        title="اختر الأحزاب"
        items={allHizbs.map((hizb) => ({ value: hizb.id, label: `الحزب ${hizb.hizb_number}` }))}
        selectedItems={pendingHizbFilter}
        onSelectionChange={handleHizbFilterChange}
        onSave={handleHizbFilterSave}
      />
    </div>
  );
}

export default StudentsPage;
