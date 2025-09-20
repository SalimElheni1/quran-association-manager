import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../../src/renderer/pages/LoginPage';

// Mock dependencies
jest.mock('../../src/renderer/utils/logger', () => ({
  error: jest.fn(),
}));

jest.mock('../../src/renderer/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: jest.fn(),
  }),
}));

jest.mock('../../src/renderer/components/PasswordInput', () => {
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

jest.mock('../../src/renderer/components/InitialCredentialsBanner', () => {
  return function MockInitialCredentialsBanner({ credentials, onClose }) {
    return credentials ? (
      <div data-testid="credentials-banner">
        <span>Initial Credentials</span>
        <button data-testid="close-banner" onClick={onClose}>Close</button>
      </div>
    ) : null;
  };
});

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('LoginPage', () => {
  let mockElectronAPI;
  let mockLogin;

  beforeEach(() => {
    mockElectronAPI = {
      getLogo: jest.fn().mockResolvedValue({ success: true, path: 'test-logo.png' }),
    };
    global.window.electronAPI = mockElectronAPI;

    mockLogin = jest.fn();
    jest.doMock('../../src/renderer/contexts/AuthContext', () => ({
      useAuth: () => ({ login: mockLogin }),
    }));

    jest.clearAllMocks();
  });

  const renderLoginPage = (props = {}) => {
    return render(
      <MemoryRouter>
        <LoginPage {...props} />
      </MemoryRouter>
    );
  };

  it('should render login form', async () => {
    renderLoginPage();

    await waitFor(() => {
      expect(screen.getByTestId('container')).toBeInTheDocument();
      expect(screen.getByText('تسجيل الدخول')).toBeInTheDocument();
      expect(screen.getByTestId('form-control')).toBeInTheDocument(); // username input
      expect(screen.getByTestId('password-input')).toBeInTheDocument();
      expect(screen.getByTestId('button')).toBeInTheDocument();
    });
  });

  it('should fetch and display logo on mount', async () => {
    renderLoginPage();

    await waitFor(() => {
      expect(mockElectronAPI.getLogo).toHaveBeenCalled();
    });

    const logoImg = screen.getByAltText('Logo');
    expect(logoImg).toHaveAttribute('src', 'test-logo.png');
  });

  it('should use default logo when fetch fails', async () => {
    mockElectronAPI.getLogo.mockRejectedValue(new Error('Failed to fetch'));

    renderLoginPage();

    await waitFor(() => {
      const logoImg = screen.getByAltText('Logo');
      expect(logoImg).toHaveAttribute('src', 'assets/logos/icon.png');
    });
  });

  it('should handle form input changes', () => {
    renderLoginPage();

    const usernameInput = screen.getByTestId('form-control');
    const passwordInput = screen.getByTestId('password-input');

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'testpass' } });

    expect(usernameInput).toHaveValue('testuser');
    expect(passwordInput).toHaveValue('testpass');
  });

  it('should handle successful login', async () => {
    mockLogin.mockResolvedValue({ success: true });

    renderLoginPage();

    const usernameInput = screen.getByTestId('form-control');
    const passwordInput = screen.getByTestId('password-input');
    const submitButton = screen.getByTestId('button');

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'testpass' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'testpass');
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('should handle failed login', async () => {
    mockLogin.mockResolvedValue({ success: false, message: 'Invalid credentials' });

    renderLoginPage();

    const usernameInput = screen.getByTestId('form-control');
    const passwordInput = screen.getByTestId('password-input');
    const submitButton = screen.getByTestId('button');

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId('alert')).toHaveTextContent('Invalid credentials');
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should show loading state during login', async () => {
    mockLogin.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ success: true }), 100)));

    renderLoginPage();

    const submitButton = screen.getByTestId('button');
    fireEvent.click(submitButton);

    expect(submitButton).toHaveTextContent('جاري الدخول...');
    expect(submitButton).toBeDisabled();

    await waitFor(() => {
      expect(submitButton).toHaveTextContent('تسجيل الدخول');
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('should display initial credentials banner when provided', () => {
    const credentials = { username: 'admin', password: 'temp123' };
    renderLoginPage({ initialCredentials: credentials });

    expect(screen.getByTestId('credentials-banner')).toBeInTheDocument();
  });

  it('should handle closing credentials banner', () => {
    const credentials = { username: 'admin', password: 'temp123' };
    const onCloseBanner = jest.fn();
    renderLoginPage({ initialCredentials: credentials, onCloseBanner });

    const closeButton = screen.getByTestId('close-banner');
    fireEvent.click(closeButton);

    expect(onCloseBanner).toHaveBeenCalled();
  });

  it('should not display credentials banner when not provided', () => {
    renderLoginPage();

    expect(screen.queryByTestId('credentials-banner')).not.toBeInTheDocument();
  });

  it('should prevent form submission when fields are empty', () => {
    renderLoginPage();

    const form = screen.getByRole('form');
    fireEvent.submit(form);

    // Form validation should prevent submission
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('should clear error message on new submission', async () => {
    mockLogin
      .mockResolvedValueOnce({ success: false, message: 'First error' })
      .mockResolvedValueOnce({ success: true });

    renderLoginPage();

    const usernameInput = screen.getByTestId('form-control');
    const passwordInput = screen.getByTestId('password-input');
    const submitButton = screen.getByTestId('button');

    // First failed attempt
    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId('alert')).toHaveTextContent('First error');
    });

    // Second successful attempt
    fireEvent.change(passwordInput, { target: { value: 'correctpass' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.queryByTestId('alert')).not.toBeInTheDocument();
    });
  });
});