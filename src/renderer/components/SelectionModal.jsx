import React, { useState } from 'react';
import { Modal, Button, Form, ListGroup } from 'react-bootstrap';

function SelectionModal({
  show,
  handleClose,
  title,
  items = [],
  selectedItems = [],
  onSelectionChange,
  onSave,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  // Ensure selectedItems is always an array
  const safeSelectedItems = Array.isArray(selectedItems) ? selectedItems : [];

  const filteredItems = items.filter(
    (item) => item.label && item.label.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleCheckboxChange = (itemId) => {
    const newSelection = safeSelectedItems.includes(itemId)
      ? safeSelectedItems.filter((id) => id !== itemId)
      : [...safeSelectedItems, itemId];
    onSelectionChange(newSelection);
  };

  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Control
          type="text"
          placeholder="البحث..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mb-3"
        />
        <ListGroup style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {filteredItems.map((item) => (
            <ListGroup.Item key={item.value}>
              <Form.Check
                type="checkbox"
                label={item.label}
                checked={safeSelectedItems.includes(item.value)}
                onChange={() => handleCheckboxChange(item.value)}
              />
            </ListGroup.Item>
          ))}
        </ListGroup>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          إغلاق
        </Button>
        <Button variant="primary" onClick={onSave}>
          حفظ التغييرات
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default SelectionModal;
