import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../src/renderer/contexts/AuthContext';

// Mock logger
jest.mock('../../src/renderer/utils/logger', () => ({
  log: jest.fn(),
}));

// Test component to access context
const TestComponent = () => {
  const { user, token, login, logout, isAuthenticated } = useAuth();
  return (
    <div>
      <div data-testid="user">{user ? JSON.stringify(user) : 'null'}</div>
      <div data-testid="token">{token || 'null'}</div>
      <div data-testid="isAuthenticated">{isAuthenticated.toString()}</div>
      <button data-testid="login-btn" onClick={() => login('test', 'pass')}>
        Login
      </button>
      <button data-testid="logout-btn" onClick={logout}>
        Logout
      </button>
    </div>
  );
};

describe('AuthContext', () => {
  let mockElectronAPI;

  beforeEach(() => {
    mockElectronAPI = {
      login: jest.fn(),
      logout: jest.fn(),
      onForceLogout: jest.fn().mockReturnValue(() => {}),
    };
    global.window.electronAPI = mockElectronAPI;
    localStorage.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should provide initial auth state', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    expect(screen.getByTestId('user')).toHaveTextContent('null');
    expect(screen.getByTestId('token')).toHaveTextContent('null');
    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
  });

  it('should handle successful login', async () => {
    const mockUser = { id: 1, username: 'testuser' };
    const mockToken = 'test-token';
    mockElectronAPI.login.mockResolvedValue({
      success: true,
      user: mockUser,
      token: mockToken,
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockUser));
      expect(screen.getByTestId('token')).toHaveTextContent(mockToken);
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
    });

    expect(localStorage.getItem('token')).toBe(mockToken);
  });

  it('should handle failed login', async () => {
    mockElectronAPI.login.mockResolvedValue({
      success: false,
      message: 'Invalid credentials',
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('null');
      expect(screen.getByTestId('token')).toHaveTextContent('null');
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
    });

    expect(localStorage.getItem('token')).toBeNull();
  });

  it('should handle logout', async () => {
    const mockUser = { id: 1, username: 'testuser' };
    const mockToken = 'test-token';
    mockElectronAPI.login.mockResolvedValue({
      success: true,
      user: mockUser,
      token: mockToken,
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    // Login first
    await act(async () => {
      screen.getByTestId('login-btn').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
    });

    // Then logout
    act(() => {
      screen.getByTestId('logout-btn').click();
    });

    expect(screen.getByTestId('user')).toHaveTextContent('null');
    expect(screen.getByTestId('token')).toHaveTextContent('null');
    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
    expect(localStorage.getItem('token')).toBeNull();
    expect(mockElectronAPI.logout).toHaveBeenCalled();
  });

  it('should handle force logout from main process', () => {
    let forceLogoutCallback;
    mockElectronAPI.onForceLogout.mockImplementation((callback) => {
      forceLogoutCallback = callback;
      return () => {};
    });

    localStorage.setItem('token', 'existing-token');

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    // Simulate force logout
    act(() => {
      forceLogoutCallback();
    });

    expect(screen.getByTestId('user')).toHaveTextContent('null');
    expect(screen.getByTestId('token')).toHaveTextContent('null');
    expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
    expect(localStorage.getItem('token')).toBeNull();
    expect(mockElectronAPI.logout).toHaveBeenCalled();
  });

  it('should cleanup force logout listener on unmount', () => {
    const mockCleanup = jest.fn();
    mockElectronAPI.onForceLogout.mockReturnValue(mockCleanup);

    const { unmount } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    unmount();

    expect(mockCleanup).toHaveBeenCalled();
  });
});
