import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmationModal from '@renderer/components/ConfirmationModal';
import '@testing-library/jest-dom';

// Mock react-bootstrap
jest.mock('react-bootstrap', () => {
    const React = require('react');
    const Modal = ({ show, children, onHide }) => {
      if (!show) return null;
      // Pass onHide to children so Modal.Header can use it
      const childrenWithProps = React.Children.map(children, child => {
        if (React.isValidElement(child) && child.type.displayName === 'ModalHeader') {
          return React.cloneElement(child, { onHide });
        }
        return child;
      });
      return <div role="dialog">{childrenWithProps}</div>;
    };
  
    const ModalHeader = ({ children, closeButton, onHide }) => (
      <div>
        {children}
        {closeButton && <button onClick={onHide}>Close</button>}
      </div>
    );
    ModalHeader.displayName = 'ModalHeader';
    Modal.Header = ModalHeader;

    Modal.Title = ({ children }) => <h4>{children}</h4>;
    Modal.Body = ({ children }) => <div>{children}</div>;
    Modal.Footer = ({ children }) => <div>{children}</div>;
    const Button = ({ children, onClick, variant }) => <button onClick={onClick} className={`btn-${variant}`}>{children}</button>;
    return { Modal, Button };
  });

describe('ConfirmationModal', () => {
  const mockHandleClose = jest.fn();
  const mockHandleConfirm = jest.fn();
  const props = {
    show: true,
    handleClose: mockHandleClose,
    handleConfirm: mockHandleConfirm,
    title: 'Test Title',
    body: 'Test Body',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render when show is false', () => {
    render(<ConfirmationModal {...props} show={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should render when show is true', () => {
    render(<ConfirmationModal {...props} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Body')).toBeInTheDocument();
  });

  it('should call handleClose when the cancel button is clicked', () => {
    render(<ConfirmationModal {...props} />);
    const cancelButton = screen.getByRole('button', { name: 'إلغاء' });
    fireEvent.click(cancelButton);
    expect(mockHandleClose).toHaveBeenCalledTimes(1);
  });

  it('should call handleConfirm when the confirm button is clicked', () => {
    render(<ConfirmationModal {...props} />);
    const confirmButton = screen.getByRole('button', { name: 'تأكيد' });
    fireEvent.click(confirmButton);
    expect(mockHandleConfirm).toHaveBeenCalledTimes(1);
  });

  it('should display custom confirm button text and variant', () => {
    render(<ConfirmationModal {...props} confirmText="Delete" confirmVariant="danger" />);
    const confirmButton = screen.getByRole('button', { name: 'Delete' });
    expect(confirmButton).toBeInTheDocument();
    expect(confirmButton).toHaveClass('btn-danger');
  });
});
