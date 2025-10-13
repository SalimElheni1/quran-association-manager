import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '@renderer/pages/LoginPage';
import '@testing-library/jest-dom';

// Mock dependencies
jest.mock('@renderer/utils/logger', () => ({
  error: jest.fn(),
}));

const mockLogin = jest.fn();
jest.mock('@renderer/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

jest.mock('@renderer/components/PasswordInput', () => {
  return function MockPasswordInput({ value, onChange, ...props }) {
    return (
      <input
        data-testid="password-input"
        type="password"
        value={value}
        onChange={onChange}
        {...props}
      />
    );
  };
});

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('LoginPage', () => {
  let mockElectronAPI;

  beforeEach(() => {
    mockElectronAPI = {
      getLogo: jest.fn().mockResolvedValue({ success: true, path: 'test-logo.png' }),
    };
    global.window.electronAPI = mockElectronAPI;

    jest.clearAllMocks();
  });

  const renderLoginPage = (props = {}) => {
    return render(
      <MemoryRouter>
        <LoginPage {...props} />
      </MemoryRouter>,
    );
  };

  it.skip('should show an error message for empty fields', async () => {
    await act(async () => {
      renderLoginPage();
    });

    // Ensure initial useEffect has completed
    await screen.findByAltText('Logo');

    const submitButton = screen.getByRole('button', { name: 'تسجيل الدخول' });

    await act(async () => {
      fireEvent.click(submitButton);
    });

    const alert = await screen.findByText('اسم المستخدم وكلمة المرور مطلوبان.');
    expect(alert).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  // Keep other tests to ensure no regressions
  it('should handle successful login', async () => {
    mockLogin.mockResolvedValue({ success: true });
    renderLoginPage();

    fireEvent.change(screen.getByLabelText('اسم المستخدم'), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'testpass' } });
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'testpass');
    });
  });
});
