import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Form, InputGroup } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { error as logError } from '@renderer/utils/logger';
import GroupStudentAssignmentModal from './GroupStudentAssignmentModal';
import TablePagination from './common/TablePagination';
import SearchIcon from './icons/SearchIcon';
import UsersIcon from './icons/UsersIcon';
import EditIcon from './icons/EditIcon';
import TrashIcon from './icons/TrashIcon';

function GroupsTabContent({ onEditGroup, onDeleteGroup, onAddGroup, refreshDependency }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [groupToAssign, setGroupToAssign] = useState(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const filters = { name: searchTerm };
      const result = await window.electronAPI.getGroups(filters);
      if (result.success) {
        setGroups(result.data);
        setCurrentPage(1); // Reset page on new data
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

  // Pagination logic
  const totalItems = groups.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedGroups = groups.slice(startIndex, startIndex + pageSize);

  return (
    <div>
      <div className="filter-bar">
        <InputGroup className="search-input-group">
          <InputGroup.Text>
            <SearchIcon />
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
        <div className="text-center">
          <Spinner animation="border" />
        </div>
      ) : (
        <>
          <Table striped bordered hover responsive className="groups-table">
            <thead>
              <tr>
                <th>#</th>
                <th>اسم المجموعة</th>
                <th>الفئة</th>
                <th>عدد الطلاب</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginatedGroups.length > 0 ? (
                paginatedGroups.map((group, index) => (
                  <tr key={group.id}>
                    <td>{startIndex + index + 1}</td>
                    <td>{group.name}</td>
                    <td>
                      {{ Kids: 'أطفال', Women: 'نساء', Men: 'رجال' }[group.category] ||
                        group.category}
                    </td>
                    <td>
                      <span className="badge bg-info text-dark badge-pill">
                        {group.studentCount || 0} طالب
                      </span>
                    </td>
                    <td className="table-actions d-flex gap-2">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => handleShowAssignmentModal(group)}
                      >
                        <UsersIcon /> إدارة الطلاب
                      </Button>
                      <Button variant="outline-success" size="sm" onClick={() => onEditGroup(group)}>
                        <EditIcon />
                      </Button>
                      <Button variant="outline-danger" size="sm" onClick={() => onDeleteGroup(group)}>
                        <TrashIcon />
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center">
                    {searchTerm
                      ? 'لا توجد نتائج تطابق معايير البحث.'
                      : 'لا يوجد مجموعات معرفة حالياً.'}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>

          {totalItems > 0 && (
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
            />
          )}
        </>
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
