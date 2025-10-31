import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Badge, Form, InputGroup } from 'react-bootstrap';
import { toast } from 'react-toastify';
import '@renderer/styles/StudentsPage.css'; // Reuse styles
import UserFormModal from '@renderer/components/UserFormModal';
import ConfirmationModal from '@renderer/components/common/ConfirmationModal';
import TablePagination from '@renderer/components/common/TablePagination';
import ExportModal from '@renderer/components/modals/ExportModal';
import ImportModal from '@renderer/components/modals/ImportModal';
import { error as logError } from '@renderer/utils/logger';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { PERMISSIONS } from '@renderer/utils/permissions';
import TrashIcon from '@renderer/components/icons/TrashIcon';
import EditIcon from '@renderer/components/icons/EditIcon';
import SearchIcon from '@renderer/components/icons/SearchIcon';
import ExportIcon from '@renderer/components/icons/ExportIcon';
import ImportIcon from '@renderer/components/icons/ImportIcon';

const adminsFields = [
  { key: 'matricule', label: 'الرقم التعريفي' },
  { key: 'username', label: 'اسم المستخدم' },
  { key: 'first_name', label: 'الاسم الأول' },
  { key: 'last_name', label: 'اللقب' },
  { key: 'email', label: 'البريد الإلكتروني' },
  { key: 'role', label: 'الدور' },
  { key: 'status', label: 'الحالة' },
];

function UsersPage() {
  const { hasPermission } = usePermissions();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Pagination states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, roleFilter]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {
        searchTerm,
        statusFilter,
        roleFilter,
        page: currentPage,
        limit: pageSize,
      };
      const result = await window.electronAPI.getUsers(filters);
      if (result && result.users) {
        setUsers(result.users);
        setTotalUsers(result.total);
        setTotalPages(result.totalPages);
      } else {
        setUsers(result);
        setTotalUsers(result.length);
        setTotalPages(1);
      }
    } catch (err) {
      logError('Error fetching users:', err);
      toast.error('فشل في تحميل بيانات المستخدمين.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, roleFilter, currentPage, pageSize]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Subscribe to import completion events (IPC via preload preferred, DOM fallback supported)
  useEffect(() => {
    const domHandler = (e) => {
      try {
        const sheets = e?.detail?.sheets || [];
        if (sheets.includes('المستخدمون') || sheets.includes('المستخدمين')) {
          fetchUsers();
          toast.info('تم تحديث قائمة المستخدمين بعد الاستيراد.');
        }
      } catch (err) {
        logError('Error handling DOM import-completed in UsersPage:', err);
      }
    };

    let unsubscribe = null;
    try {
      if (window.electronAPI && typeof window.electronAPI.onImportCompleted === 'function') {
        unsubscribe = window.electronAPI.onImportCompleted((payload) => {
          try {
            const sheets = payload?.sheets || [];
            if (sheets.includes('المستخدمون') || sheets.includes('المستخدمين')) {
              fetchUsers();
              toast.info('تم تحديث قائمة المستخدمين بعد الاستيراد.');
            }
          } catch (err) {
            logError('Error handling import-completed IPC payload in UsersPage:', err);
          }
        });
      }
    } catch (err) {
      logError('Failed to register import completion IPC listener in UsersPage:', err);
    }

    window.addEventListener('app:import-completed', domHandler);
    return () => {
      window.removeEventListener('app:import-completed', domHandler);
      try {
        if (typeof unsubscribe === 'function') unsubscribe();
      } catch (e) {
        /* ignore */
      }
    };
  }, [fetchUsers]);

  const handleSaveSuccess = () => {
    setShowUserModal(false);
    setEditingUser(null);
    fetchUsers();
  };

  const handleShowAddModal = () => {
    setEditingUser(null);
    setShowUserModal(true);
  };

  const handleEditUser = async (user) => {
    try {
      const fullUser = await window.electronAPI.getUserById(user.id);
      setEditingUser(fullUser);
      setShowUserModal(true);
    } catch (err) {
      logError('Error fetching full user details:', err);
      toast.error('فشل في تحميل التفاصيل الكاملة للمستخدم.');
    }
  };

  const handleDeleteRequest = (user) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      await window.electronAPI.deleteUser(userToDelete.id);
      toast.success('تم حذف المستخدم بنجاح.');
      fetchUsers();
    } catch (err) {
      logError('Error deleting user:', err);
      toast.error('فشل في حذف المستخدم.');
    } finally {
      setShowDeleteModal(false);
      setUserToDelete(null);
    }
  };

  const roleTranslations = {
    Superadmin: 'مدير النظام',
    Administrator: 'الهيئة المديرة',
    FinanceManager: 'الهيئة المديرة - المالية',
    SessionSupervisor: 'مشرف حصص',
  };

  const statusTranslations = {
    active: 'نشط',
    inactive: 'غير نشط',
  };
  const statusVariants = { active: 'success', inactive: 'secondary' };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>إدارة المستخدمين</h1>
        <div className="page-header-actions">
          {hasPermission(PERMISSIONS.USERS_VIEW) && (
            <Button variant="outline-primary" onClick={() => setShowExportModal(true)}>
              <ExportIcon className="ms-2" /> تصدير البيانات
            </Button>
          )}
          {hasPermission(PERMISSIONS.USERS_CREATE) && (
            <Button variant="outline-success" onClick={() => setShowImportModal(true)}>
              <ImportIcon className="ms-2" /> استيراد البيانات
            </Button>
          )}
          {hasPermission(PERMISSIONS.USERS_CREATE) && (
            <Button variant="primary" onClick={handleShowAddModal}>
              <i className="fas fa-plus ms-2"></i> إضافة مستخدم جديد
            </Button>
          )}
        </div>
      </div>

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
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">الحالة (الكل)</option>
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
          </Form.Select>
          <Form.Select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">الدور (الكل)</option>
            <option value="Superadmin">مدير النظام</option>
            <option value="Administrator">الهيئة المديرة</option>
            <option value="FinanceManager">الهيئة المديرة - المالية</option>
            <option value="SessionSupervisor">مشرف حصص</option>
          </Form.Select>
        </div>
      </div>

      {loading ? (
        <div className="text-center">
          <Spinner animation="border" />
        </div>
      ) : (
        <div>
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                <th>#</th>
                <th>الرقم التعريفي</th>
                <th>الاسم الكامل</th>
                <th>اسم المستخدم</th>
                <th>الدور</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.length > 0 ? (
                users.map((user, index) => (
                  <tr key={user.id}>
                    <td>{(currentPage - 1) * pageSize + index + 1}</td>
                    <td>{user.matricule}</td>
                    <td>{`${user.first_name || ''} ${user.last_name || ''}`}</td>
                    <td>{user.username}</td>
                    <td>
                      {user.roles && user.roles.length > 0 ? (
                        user.roles.map((role, idx) => (
                          <Badge key={idx} bg="info" className="me-1">
                            {roleTranslations[role] || role}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted">لا يوجد دور</span>
                      )}
                    </td>
                    <td>
                      <Badge bg={statusVariants[user.status]}>
                        {statusTranslations[user.status]}
                      </Badge>
                    </td>
                    <td className="table-actions d-flex gap-2">
                      {hasPermission(PERMISSIONS.USERS_EDIT) && (
                        <Button
                          variant="outline-success"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                        >
                          <EditIcon />
                        </Button>
                      )}
                      {hasPermission(PERMISSIONS.USERS_DELETE) && (
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => handleDeleteRequest(user)}
                        >
                          <TrashIcon />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="text-center">
                    لم يتم العثور على مستخدمين.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>

          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalUsers}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newPageSize, newPage) => {
              setPageSize(newPageSize);
              setCurrentPage(newPage);
            }}
          />
        </div>
      )}
      <UserFormModal
        show={showUserModal}
        handleClose={() => setShowUserModal(false)}
        onSaveSuccess={handleSaveSuccess}
        user={editingUser}
      />
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={confirmDelete}
        title="تأكيد الحذف"
        body={`هل أنت متأكد من رغبتك في حذف المستخدم "${userToDelete?.username}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmVariant="danger"
        confirmText="نعم، قم بالحذف"
      />
      <ExportModal
        show={showExportModal}
        handleClose={() => setShowExportModal(false)}
        exportType="admins"
        fields={adminsFields}
        title="تصدير بيانات المستخدمين"
      />
      <ImportModal
        show={showImportModal}
        handleClose={() => setShowImportModal(false)}
        importType="المستخدمين"
        title="استيراد بيانات المستخدمين"
      />
    </div>
  );
}

export default UsersPage;
