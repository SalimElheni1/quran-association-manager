import React from 'react';
import { Modal, Button } from 'react-bootstrap';

function ConfirmationModal({
  show,
  handleClose,
  handleConfirm,
  title,
  body,
  confirmVariant = 'primary',
  confirmText = 'تأكيد',
}) {
  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>{body}</Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          إلغاء
        </Button>
        <Button variant={confirmVariant} onClick={handleConfirm}>
          {confirmText}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ConfirmationModal;
