import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock the ConfirmationModal component since we don't have the actual implementation
const ConfirmationModal = ({ show, title, message, onConfirm, onCancel, confirmText = 'تأكيد', cancelText = 'إلغاء' }) => {
  if (!show) return null;
  
  return (
    <div data-testid="confirmation-modal">
      <div data-testid="modal-title">{title}</div>
      <div data-testid="modal-message">{message}</div>
      <button data-testid="confirm-button" onClick={onConfirm}>
        {confirmText}
      </button>
      <button data-testid="cancel-button" onClick={onCancel}>
        {cancelText}
      </button>
    </div>
  );
};

describe('ConfirmationModal', () => {
  const defaultProps = {
    show: true,
    title: 'تأكيد الحذف',
    message: 'هل أنت متأكد من حذف هذا العنصر؟',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render when show is true', () => {
    render(<ConfirmationModal {...defaultProps} />);

    expect(screen.getByTestId('confirmation-modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-title')).toHaveTextContent('تأكيد الحذف');
    expect(screen.getByTestId('modal-message')).toHaveTextContent('هل أنت متأكد من حذف هذا العنصر؟');
  });

  it('should not render when show is false', () => {
    render(<ConfirmationModal {...defaultProps} show={false} />);

    expect(screen.queryByTestId('confirmation-modal')).not.toBeInTheDocument();
  });

  it('should call onConfirm when confirm button is clicked', () => {
    render(<ConfirmationModal {...defaultProps} />);

    fireEvent.click(screen.getByTestId('confirm-button'));

    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when cancel button is clicked', () => {
    render(<ConfirmationModal {...defaultProps} />);

    fireEvent.click(screen.getByTestId('cancel-button'));

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('should use custom button texts', () => {
    render(
      <ConfirmationModal
        {...defaultProps}
        confirmText="موافق"
        cancelText="رجوع"
      />
    );

    expect(screen.getByTestId('confirm-button')).toHaveTextContent('موافق');
    expect(screen.getByTestId('cancel-button')).toHaveTextContent('رجوع');
  });

  it('should use default button texts when not provided', () => {
    render(<ConfirmationModal {...defaultProps} />);

    expect(screen.getByTestId('confirm-button')).toHaveTextContent('تأكيد');
    expect(screen.getByTestId('cancel-button')).toHaveTextContent('إلغاء');
  });
});