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
  const [selectedNonMembers, setSelectedNonMembers] = useState(new Set());
  const [selectedMembers, setSelectedMembers] = useState(new Set());

  useEffect(() => {
    const fetchAssignmentData = async () => {
      if (show && group) {
        setLoading(true);
        try {
          const result = await window.electronAPI.getAssignmentData(group.id);
          if (result.success) {
            const allStudents = result.data;
            setMembers(allStudents.filter(s => s.isMember));
            setNonMembers(allStudents.filter(s => !s.isMember));
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
    return nonMembers.filter(s => s.name.toLowerCase().includes(nonMembersSearch.toLowerCase()));
  }, [nonMembers, nonMembersSearch]);

  const handleNonMemberSelect = (studentId) => {
    const newSelection = new Set(selectedNonMembers);
    if (newSelection.has(studentId)) {
      newSelection.delete(studentId);
    } else {
      newSelection.add(studentId);
    }
    setSelectedNonMembers(newSelection);
  };

  const handleMemberSelect = (studentId) => {
    const newSelection = new Set(selectedMembers);
    if (newSelection.has(studentId)) {
      newSelection.delete(studentId);
    } else {
      newSelection.add(studentId);
    }
    setSelectedMembers(newSelection);
  };

  const handleAddStudents = () => {
    const toAdd = nonMembers.filter(s => selectedNonMembers.has(s.id));
    setMembers(prev => [...prev, ...toAdd].sort((a, b) => a.name.localeCompare(b.name)));
    setNonMembers(prev => prev.filter(s => !selectedNonMembers.has(s.id)));
    setSelectedNonMembers(new Set());
  };

  const handleRemoveStudents = () => {
    const toRemove = members.filter(s => selectedMembers.has(s.id));
    setNonMembers(prev => [...prev, ...toRemove].sort((a, b) => a.name.localeCompare(b.name)));
    setMembers(prev => prev.filter(s => !selectedMembers.has(s.id)));
    setSelectedMembers(new Set());
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const memberIds = members.map(m => m.id);
      const result = await window.electronAPI.updateGroupStudents({ groupId: group.id, studentIds: memberIds });
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
      {students.map(s => (
        <ListGroup.Item
          key={s.id}
          action
          active={selected.has(s.id)}
          onClick={() => onSelect(s.id)}
        >
          {s.name} ({s.matricule})
        </ListGroup.Item>
      ))}
    </ListGroup>
  );

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>إدارة الطلاب في مجموعة: {group?.name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading && !members.length ? (
          <div className="text-center"><Spinner animation="border" /></div>
        ) : (
          <Row>
            <Col md={5}>
              <h5>الطلاب المتاحون</h5>
              <InputGroup className="mb-2">
                <Form.Control
                  placeholder="بحث..."
                  value={nonMembersSearch}
                  onChange={e => setNonMembersSearch(e.target.value)}
                />
              </InputGroup>
              {renderStudentList(filteredNonMembers, selectedNonMembers, handleNonMemberSelect)}
            </Col>
            <Col md={2} className="d-flex flex-column align-items-center justify-content-center gap-2">
              <Button variant="outline-secondary" onClick={handleAddStudents} disabled={selectedNonMembers.size === 0}>
                <ArrowLeftIcon /> إضافة
              </Button>
              <Button variant="outline-secondary" onClick={handleRemoveStudents} disabled={selectedMembers.size === 0}>
                إزالة <ArrowRightIcon />
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
        <Button variant="secondary" onClick={handleClose}>إلغاء</Button>
        <Button variant="primary" onClick={handleSave} disabled={loading}>
          {loading ? <Spinner as="span" animation="border" size="sm" /> : 'حفظ التغييرات'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default GroupStudentAssignmentModal;
