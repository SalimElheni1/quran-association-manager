import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../../src/renderer/components/ProtectedRoute';

// Mock logger
jest.mock('../../src/renderer/utils/logger', () => ({
  log: jest.fn(),
}));

// Mock useAuth hook
jest.mock('../../src/renderer/contexts/AuthContext', () => {
  const mockUseAuth = jest.fn(() => ({ isAuthenticated: false }));
  return {
    useAuth: mockUseAuth,
    _mockUseAuth: mockUseAuth, // Expose for test access
  };
});

describe('ProtectedRoute', () => {
  let mockUseAuth;
  
  beforeEach(() => {
    const authModule = require('../../src/renderer/contexts/AuthContext');
    mockUseAuth = authModule._mockUseAuth;
    
    global.window.electronAPI = {
      onForceLogout: jest.fn().mockReturnValue(() => {}),
    };
    
    jest.clearAllMocks();
  });

  it('should render children when authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div data-testid="protected-content">Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('should redirect to login when not authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div data-testid="protected-content">Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('navigate')).toBeInTheDocument();
    expect(screen.getByTestId('navigate')).toHaveAttribute('data-to', '/login');
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });
});