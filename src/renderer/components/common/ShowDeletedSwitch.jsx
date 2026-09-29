import React from 'react';
import { Form } from 'react-bootstrap';

/**
 * Switch that lists the deleted records (kept for history) instead of the live ones, so they
 * can be restored. Deleted money rows are "voided" (ملغاة) rather than deleted.
 */
const ShowDeletedSwitch = ({ id, checked, onChange, label = 'عرض المحذوفات' }) => (
  <Form.Check
    type="switch"
    id={id}
    label={label}
    checked={checked}
    onChange={(e) => onChange(e.target.checked)}
    className="show-deleted-switch align-self-center"
  />
);

export default ShowDeletedSwitch;
