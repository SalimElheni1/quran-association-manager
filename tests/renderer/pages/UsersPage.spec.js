import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import UsersPage from '@renderer/pages/UsersPage';
import '@testing-library/jest-dom';

// Mock AuthContext
jest.mock('@renderer/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({ isAuthenticated: true, user: { id: 1, role: 'Admin' } })),
}));

// Mock usePermissions hook
jest.mock('@renderer/hooks/usePermissions', () => ({
  usePermissions: jest.fn(() => ({ hasPermission: jest.fn(() => true) })),
}));

// Mock react-bootstrap
jest.mock('react-bootstrap', () => ({
  Table: ({ children }) => <table>{children}</table>,
  Button: ({ children, onClick, variant, size }) => (
    <button onClick={onClick} className={`btn-${variant} btn-${size}`}>
      {children}
    </button>
  ),
  Spinner: () => <div role="status" data-testid="spinner" />,
  Badge: ({ children, bg }) => <span className={`badge bg-${bg}`}>{children}</span>,
}));

// Mock child components
jest.mock(
  '@renderer/components/UserFormModal',
  () => {
    const UserFormModal = ({ show, handleClose, onSaveSuccess, user }) => {
      if (!show) return null;
      return (
        <div data-testid="user-form-modal">
          <button onClick={handleClose}>Close</button>
          <button onClick={onSaveSuccess}>Save</button>
          {user && <div data-testid="editing-user">{user.id}</div>}
        </div>
      );
    };
    UserFormModal.displayName = 'UserFormModal';
    return UserFormModal;
  }
);

jest.mock(
  '@renderer/components/common/ConfirmationModal',
  () => {
    const ConfirmationModal = ({ show, handleClose, handleConfirm, title, body }) => {
      if (!show) return null;
      return (
        <div data-testid="confirmation-modal">
          <h4>{title}</h4>
          <p>{body}</p>
          <button onClick={handleClose}>Close</button>
          <button onClick={handleConfirm}>Confirm</button>
        </div>
      );
    };
    ConfirmationModal.displayName = 'ConfirmationModal';
    return ConfirmationModal;
  }
);

// Mock electronAPI
const mockElectronAPI = {
  getUsers: jest.fn(),
  getUserById: jest.fn(),
  deleteUser: jest.fn(),
};
global.window.electronAPI = mockElectronAPI;

// Mock react-toastify
jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('UsersPage', () => {
  const mockUsers = [
    {
      id: 1,
      matricule: 'U001',
      first_name: 'John',
      last_name: 'Doe',
      username: 'johndoe',
      role: 'Admin',
      status: 'active',
    },
    {
      id: 2,
      matricule: 'U002',
      first_name: 'Jane',
      last_name: 'Doe',
      username: 'janedoe',
      role: 'Manager',
      status: 'inactive',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockElectronAPI.getUsers.mockResolvedValue(mockUsers);
    mockElectronAPI.getUserById.mockResolvedValue(mockUsers[0]);
    mockElectronAPI.deleteUser.mockResolvedValue({ success: true });
  });

  it('should display a loading spinner while fetching users', () => {
    render(<UsersPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('should display the users table after a successful fetch', async () => {
    await act(async () => {
      render(<UsersPage />);
    });
    expect(await screen.findByText('johndoe')).toBeInTheDocument();
    expect(screen.getByText('janedoe')).toBeInTheDocument();
  });

  it('should display a message when no users are found', async () => {
    mockElectronAPI.getUsers.mockResolvedValue([]);
    await act(async () => {
      render(<UsersPage />);
    });
    expect(await screen.findByText('لم يتم العثور على مستخدمين.')).toBeInTheDocument();
  });

  it('should open the UserFormModal when the "Add New User" button is clicked', async () => {
    await act(async () => {
      render(<UsersPage />);
    });
    await screen.findByText('johndoe'); // wait for page to load
    fireEvent.click(screen.getByRole('button', { name: /إضافة مستخدم جديد/i }));
    expect(await screen.findByTestId('user-form-modal')).toBeInTheDocument();
  });

  it('should open the UserFormModal with user data when an "Edit" button is clicked', async () => {
    await act(async () => {
      render(<UsersPage />);
    });
    await screen.findByText('johndoe');
    const editButtons = screen.getAllByRole('button', { name: /تعديل/i });
    fireEvent.click(editButtons[0]);
    expect(await screen.findByTestId('user-form-modal')).toBeInTheDocument();
    expect(screen.getByTestId('editing-user')).toHaveTextContent('1');
  });

  it('should open the ConfirmationModal when a "Delete" button is clicked', async () => {
    await act(async () => {
      render(<UsersPage />);
    });
    await screen.findByText('johndoe');
    const deleteButtons = screen.getAllByRole('button', { name: /حذف/i });
    fireEvent.click(deleteButtons[0]);
    expect(await screen.findByTestId('confirmation-modal')).toBeInTheDocument();
    expect(screen.getByText('تأكيد الحذف')).toBeInTheDocument();
  });

  it('should call the deleteUser API when the delete is confirmed', async () => {
    await act(async () => {
      render(<UsersPage />);
    });
    await screen.findByText('johndoe');
    const deleteButtons = screen.getAllByRole('button', { name: /حذف/i });
    fireEvent.click(deleteButtons[0]);
    await screen.findByTestId('confirmation-modal');
    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    await act(async () => {
      fireEvent.click(confirmButton);
    });
    expect(mockElectronAPI.deleteUser).toHaveBeenCalledWith(1);
  });
});
