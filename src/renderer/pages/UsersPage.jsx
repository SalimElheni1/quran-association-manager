import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Badge } from 'react-bootstrap';
import { toast } from 'react-toastify';
import '../styles/StudentsPage.css'; // Reuse styles
import UserFormModal from '../components/UserFormModal';

function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedUsers = await window.electronAPI.getUsers();
      setUsers(fetchedUsers);
    } catch (err) {
      console.error('Error fetching users:', err);
      toast.error('فشل في تحميل بيانات المستخدمين.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSaveSuccess = () => {
    setShowAddModal(false);
    fetchUsers();
  };

  const handleShowAddModal = () => {
    setShowAddModal(true);
  };

  const handleEditUser = (user) => {
    toast.info(`ميزة تعديل المستخدم ${user.username} سيتم تنفيذها قريباً.`);
  };

  const handleDeleteUser = (user) => {
    toast.info(`ميزة حذف المستخدم ${user.username} سيتم تنفيذها قريباً.`);
  };

  const roleTranslations = {
    Manager: 'الهيئة المديرة',
    FinanceManager: 'الهيئة المديرة - المالية',
    Admin: 'إداري',
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
        <Button variant="primary" onClick={handleShowAddModal}>
          <i className="fas fa-plus ms-2"></i> إضافة مستخدم جديد
        </Button>
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
                  <td>{`${user.first_name || ''} ${user.last_name || ''}`}</td>
                  <td>{user.username}</td>
                  <td>
                    <Badge bg="info">{roleTranslations[user.role] || user.role}</Badge>
                  </td>
                  <td>
                    <Badge bg={statusVariants[user.status]}>
                      {statusTranslations[user.status]}
                    </Badge>
                  </td>
                  <td className="table-actions d-flex gap-2">
                    <Button
                      variant="outline-success"
                      size="sm"
                      onClick={() => handleEditUser(user)}
                    >
                      <i className="fas fa-edit"></i> تعديل
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDeleteUser(user)}
                    >
                      <i className="fas fa-trash"></i> حذف
                    </Button>
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
        show={showAddModal}
        handleClose={() => setShowAddModal(false)}
        onSaveSuccess={handleSaveSuccess}
      />
    </div>
  );
}

export default UsersPage;
