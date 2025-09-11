import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Form, InputGroup } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { error as logError } from '@renderer/utils/logger';
import GroupFormModal from './GroupFormModal';
import ConfirmationModal from './ConfirmationModal';
import GroupStudentAssignmentModal from './GroupStudentAssignmentModal';

function GroupsTabContent() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState(null);

  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [groupToAssign, setGroupToAssign] = useState(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const filters = { name: searchTerm };
      const result = await window.electronAPI.getGroups(filters);
      if (result.success) {
        setGroups(result.data);
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      logError('Error fetching groups:', err);
      toast.error('فشل تحميل بيانات المجموعات.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleShowAddModal = () => {
    setEditingGroup(null);
    setShowModal(true);
  };

  const handleShowEditModal = (group) => {
    setEditingGroup(group);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingGroup(null);
  };

  const handleSaveGroup = async (formData, groupId) => {
    try {
      let result;
      if (groupId) {
        result = await window.electronAPI.updateGroup(groupId, formData);
        if (result.success) {
          toast.success(`تم تحديث المجموعة "${formData.name}" بنجاح!`);
        }
      } else {
        result = await window.electronAPI.addGroup(formData);
        if (result.success) {
          toast.success(`تمت إضافة المجموعة "${formData.name}" بنجاح!`);
        }
      }

      if (result.success) {
        fetchGroups();
        handleCloseModal();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      logError('Error saving group:', err);
      toast.error(err.message || 'فشل حفظ المجموعة.');
    }
  };

  const handleDeleteRequest = (group) => {
    setGroupToDelete(group);
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setGroupToDelete(null);
    setShowDeleteModal(false);
  };

  const confirmDelete = async () => {
    if (!groupToDelete) return;

    try {
      const result = await window.electronAPI.deleteGroup(groupToDelete.id);
      if (result.success) {
        toast.success(`تم حذف المجموعة "${groupToDelete.name}" بنجاح.`);
        fetchGroups();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      logError('Error deleting group:', err);
      toast.error(`فشل حذف المجموعة "${groupToDelete.name}".`);
    } finally {
      handleCloseDeleteModal();
    }
  };

  // This is passed up to the parent `StudentsPage` to trigger the modal
  // A bit of a workaround for the button being in the parent component.
  // A better solution might involve React Context or a different component structure.
  useEffect(() => {
    const handler = () => handleShowAddModal();
    document.addEventListener('show-add-group-modal', handler);
    return () => document.removeEventListener('show-add-group-modal', handler);
  }, []);

  const handleShowAssignmentModal = (group) => {
    setGroupToAssign(group);
    setShowAssignmentModal(true);
  };

  const handleCloseAssignmentModal = () => {
    setGroupToAssign(null);
    setShowAssignmentModal(false);
  };

  return (
    <div>
      <div className="filter-bar">
        <InputGroup className="search-input-group">
          <InputGroup.Text>
            <i className="fas fa-search"></i>
          </InputGroup.Text>
          <Form.Control
            type="search"
            placeholder="البحث باسم المجموعة..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </InputGroup>
      </div>

      {loading ? (
        <div className="text-center"><Spinner animation="border" /></div>
      ) : (
        <Table striped bordered hover responsive className="groups-table">
          <thead>
            <tr>
              <th>#</th>
              <th>اسم المجموعة</th>
              <th>الفئة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {groups.length > 0 ? (
              groups.map((group, index) => (
                <tr key={group.id}>
                  <td>{index + 1}</td>
                  <td>{group.name}</td>
                  <td>{{'Kids': 'أطفال', 'Women': 'نساء', 'Men': 'رجال'}[group.category] || group.category}</td>
                  <td className="table-actions d-flex gap-2">
                    <Button variant="outline-primary" size="sm" onClick={() => handleShowAssignmentModal(group)}>
                      <i className="fas fa-users"></i> إدارة الطلاب
                    </Button>
                    <Button variant="outline-success" size="sm" onClick={() => handleShowEditModal(group)}>
                      <i className="fas fa-edit"></i> تعديل
                    </Button>
                    <Button variant="outline-danger" size="sm" onClick={() => handleDeleteRequest(group)}>
                      <i className="fas fa-trash"></i> حذف
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="text-center">
                  {searchTerm ? 'لا توجد نتائج تطابق معايير البحث.' : 'لا يوجد مجموعات معرفة حالياً.'}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      )}

      <GroupFormModal
        show={showModal}
        handleClose={handleCloseModal}
        onSave={handleSaveGroup}
        group={editingGroup}
      />

      <ConfirmationModal
        show={showDeleteModal}
        handleClose={handleCloseDeleteModal}
        handleConfirm={confirmDelete}
        title="تأكيد حذف المجموعة"
        body={`هل أنت متأكد من رغبتك في حذف المجموعة "${groupToDelete?.name}"؟ سيتم أيضًا إزالة جميع الطلاب من هذه المجموعة.`}
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />

      <GroupStudentAssignmentModal
        show={showAssignmentModal}
        handleClose={handleCloseAssignmentModal}
        group={groupToAssign}
        onAssignmentSave={fetchGroups} // Optional: Refetch group data if counts are displayed
      />
    </div>
  );
}

export default GroupsTabContent;
