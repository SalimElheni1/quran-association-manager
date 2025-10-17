import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, ListGroup, Form, InputGroup, Spinner, Row, Col } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { error as logError } from '@renderer/utils/logger';
import ArrowLeftIcon from './icons/ArrowLeftIcon';
import ArrowRightIcon from './icons/ArrowRightIcon';

function GroupStudentAssignmentModal({ show, handleClose, group, onAssignmentSave }) {
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState([]);
  const [nonMembers, setNonMembers] = useState([]);

  const [nonMembersSearch, setNonMembersSearch] = useState('');
  const [selectedNonMembers, setSelectedNonMembers] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);

  useEffect(() => {
    const fetchAssignmentData = async () => {
      if (show && group) {
        setLoading(true);
        try {
          const result = await window.electronAPI.getAssignmentData(group.id);
          if (result.success) {
            const allStudents = result.data;
            setMembers(allStudents.filter((s) => s.isMember));
            setNonMembers(allStudents.filter((s) => !s.isMember));
            // Reset selections when modal opens with new data
            setSelectedNonMembers([]);
            setSelectedMembers([]);
          } else {
            toast.error(result.message);
          }
        } catch (err) {
          logError('Error fetching assignment data:', err);
          toast.error('فشل تحميل بيانات الطلاب للمجموعة.');
        } finally {
          setLoading(false);
        }
      }
    };
    fetchAssignmentData();
  }, [show, group]);

  const filteredNonMembers = useMemo(() => {
    if (!nonMembersSearch) return nonMembers;
    return nonMembers.filter((s) => s.name.toLowerCase().includes(nonMembersSearch.toLowerCase()));
  }, [nonMembers, nonMembersSearch]);

  const handleNonMemberSelect = (studentId, event) => {
    let newSelection = [...selectedNonMembers];
    if (event.ctrlKey || event.metaKey) {
      // Multi-selection
      const index = newSelection.indexOf(studentId);
      if (index > -1) {
        newSelection.splice(index, 1);
      } else {
        newSelection.push(studentId);
      }
    } else {
      // Single selection - deselect all others
      newSelection = [studentId];
    }
    setSelectedNonMembers(newSelection);
  };

  const handleMemberSelect = (studentId, event) => {
    let newSelection = [...selectedMembers];
    if (event.ctrlKey || event.metaKey) {
      // Multi-selection
      const index = newSelection.indexOf(studentId);
      if (index > -1) {
        newSelection.splice(index, 1);
      } else {
        newSelection.push(studentId);
      }
    } else {
      // Single selection - deselect all others
      newSelection = [studentId];
    }
    setSelectedMembers(newSelection);
  };

  const handleAddStudents = () => {
    if (selectedNonMembers.length === 0) return;

    const toAdd = nonMembers.filter((s) => selectedNonMembers.includes(s.id));
    const addedCount = toAdd.length;

    setMembers((prev) => [...prev, ...toAdd].sort((a, b) => a.name.localeCompare(b.name)));
    setNonMembers((prev) => prev.filter((s) => !selectedNonMembers.includes(s.id)));
    setSelectedNonMembers([]);

    if (addedCount > 0) {
      toast.success(`تمت إضافة ${addedCount} طالب بنجاح إلى المجموعة.`);
    }
  };

  const handleRemoveStudents = () => {
    if (selectedMembers.length === 0) return;

    const toRemove = members.filter((s) => selectedMembers.includes(s.id));
    const removedCount = toRemove.length;

    setNonMembers((prev) => [...prev, ...toRemove].sort((a, b) => a.name.localeCompare(b.name)));
    setMembers((prev) => prev.filter((s) => !selectedMembers.includes(s.id)));
    setSelectedMembers([]);

    if (removedCount > 0) {
      toast.success(`تمت إزالة ${removedCount} طالب من المجموعة.`);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const memberIds = members.map((m) => m.id);
      const result = await window.electronAPI.updateGroupStudents({
        groupId: group.id,
        studentIds: memberIds,
      });
      if (result.success) {
        toast.success('تم تحديث قائمة الطلاب في المجموعة بنجاح.');
        if (onAssignmentSave) onAssignmentSave();
        handleClose();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      logError('Error saving group assignments:', err);
      toast.error('حدث خطأ أثناء حفظ التغييرات.');
    } finally {
      setLoading(false);
    }
  };

  const renderStudentList = (students, selected, onSelect) => (
    <ListGroup style={{ maxHeight: '300px', overflowY: 'auto' }}>
      {students.map((s) => (
        <ListGroup.Item
          key={s.id}
          action
          active={selected.includes(s.id)}
          onClick={(event) => onSelect(s.id, event)}
          style={{ cursor: 'pointer' }}
        >
          {s.name} ({s.matricule})
        </ListGroup.Item>
      ))}
    </ListGroup>
  );

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>
          إدارة الطلاب في مجموعة: {group?.name} ({members.length} طالب حالياً)
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading && !members.length ? (
          <div className="text-center">
            <Spinner animation="border" />
          </div>
        ) : (
          <Row>
            <Col md={5}>
              <h5>الطلاب المتاحون</h5>
              <InputGroup className="mb-2">
                <Form.Control
                  placeholder="بحث..."
                  value={nonMembersSearch}
                  onChange={(e) => setNonMembersSearch(e.target.value)}
                />
              </InputGroup>
              {renderStudentList(filteredNonMembers, selectedNonMembers, handleNonMemberSelect)}
            </Col>
            <Col
              md={2}
              className="d-flex flex-column align-items-center justify-content-center gap-2"
            >
              <Button
                variant="outline-secondary"
                onClick={handleAddStudents}
                disabled={selectedNonMembers.length === 0}
              >
                <ArrowLeftIcon /> إضافة ({selectedNonMembers.length})
              </Button>
              <Button
                variant="outline-secondary"
                onClick={handleRemoveStudents}
                disabled={selectedMembers.length === 0}
              >
                حذف ({selectedMembers.length}) <ArrowRightIcon />
              </Button>
            </Col>
            <Col md={5}>
              <h5>الطلاب في المجموعة</h5>
              {renderStudentList(members, selectedMembers, handleMemberSelect)}
            </Col>
          </Row>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          إلغاء
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={loading}>
          {loading ? <Spinner as="span" animation="border" size="sm" /> : 'حفظ التغييرات'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default GroupStudentAssignmentModal;
