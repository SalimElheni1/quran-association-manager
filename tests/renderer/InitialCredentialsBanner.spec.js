import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InitialCredentialsBanner from '@renderer/components/InitialCredentialsBanner';
import { toast } from 'react-toastify';
import '@testing-library/jest-dom';

// Mock react-bootstrap
jest.mock('react-bootstrap', () => {
  const Alert = ({ children, ...props }) => (
    <div role="alert" {...props}>
      {children}
    </div>
  );
  const Button = ({ children, ...props }) => <button {...props}>{children}</button>;
  Alert.Heading = ({ children, ...props }) => <div {...props}>{children}</div>;
  Alert.Heading.displayName = 'AlertHeading';
  return { Alert, Button };
});

// Mock react-toastify
jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
  },
}));

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(),
  },
});

describe('InitialCredentialsBanner', () => {
  const mockOnClose = jest.fn();
  const credentials = {
    username: 'testuser',
    password: 'testpassword',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render if no credentials are provided', () => {
    render(<InitialCredentialsBanner credentials={null} onClose={mockOnClose} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should render the banner with credentials', async () => {
    render(<InitialCredentialsBanner credentials={credentials} onClose={mockOnClose} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(await screen.findByText(credentials.username)).toBeInTheDocument();
    expect(await screen.findByText(credentials.password)).toBeInTheDocument();
  });

  it('should call onClose, copy to clipboard, and show toast on button click', () => {
    render(<InitialCredentialsBanner credentials={credentials} onClose={mockOnClose} />);
    const button = screen.getByRole('button', { name: /نسخ وإغلاق/i });
    fireEvent.click(button);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `Username: ${credentials.username}\nPassword: ${credentials.password}`,
    );
    expect(toast.success).toHaveBeenCalledWith('تم نسخ البيانات بنجاح!');
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
