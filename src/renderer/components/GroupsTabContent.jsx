import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Form, InputGroup } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { error as logError } from '@renderer/utils/logger';
import GroupStudentAssignmentModal from './GroupStudentAssignmentModal';

function GroupsTabContent({ onEditGroup, onDeleteGroup, refreshDependency }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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
  }, [fetchGroups, refreshDependency]);

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
                    <Button variant="outline-success" size="sm" onClick={() => onEditGroup(group)}>
                      <i className="fas fa-edit"></i> تعديل
                    </Button>
                    <Button variant="outline-danger" size="sm" onClick={() => onDeleteGroup(group)}>
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
