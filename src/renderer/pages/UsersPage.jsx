import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Badge } from 'react-bootstrap';
import { toast } from 'react-toastify';
import '@renderer/styles/StudentsPage.css'; // Reuse styles
import UserFormModal from '@renderer/components/UserFormModal';
import ConfirmationModal from '@renderer/components/common/ConfirmationModal';
import { error as logError } from '@renderer/utils/logger';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { PERMISSIONS } from '@renderer/utils/permissions';
import TrashIcon from '@renderer/components/icons/TrashIcon';
import EditIcon from '@renderer/components/icons/EditIcon';

function UsersPage() {
  const { hasPermission } = usePermissions();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedUsers = await window.electronAPI.getUsers();
      setUsers(fetchedUsers);
    } catch (err) {
      logError('Error fetching users:', err);
      toast.error('فشل في تحميل بيانات المستخدمين.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
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
        {hasPermission(PERMISSIONS.USERS_CREATE) && (
          <Button variant="primary" onClick={handleShowAddModal}>
            <i className="fas fa-plus ms-2"></i> إضافة مستخدم جديد
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center">
          <Spinner animation="border" />
        </div>
      ) : (
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
                  <td>{index + 1}</td>
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
                <td colSpan="5" className="text-center">
                  لم يتم العثور على مستخدمين.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
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
    </div>
  );
}

export default UsersPage;
