import React from 'react';
import { render, screen } from '@testing-library/react';
import ProtectedRoute from '@renderer/components/ProtectedRoute';
import { usePermissions } from '@renderer/hooks/usePermissions';

// Mock the custom hooks
jest.mock('@renderer/hooks/usePermissions');
jest.mock('@renderer/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({ isAuthenticated: true })),
}));

// Mock react-bootstrap components to isolate the ProtectedRoute logic
jest.mock('react-bootstrap', () => {
  const Alert = ({ children }) => <div>{children}</div>;
  Alert.Heading = ({ children }) => <h4>{children}</h4>;
  return { Alert };
});

describe('ProtectedRoute', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should render children when user has required permissions', () => {
    // Arrange: Mock that the user has the required permissions
    usePermissions.mockReturnValue({
      hasAnyPermission: jest.fn(() => true),
      canAccessModule: jest.fn(() => true),
    });

    // Act
    render(
      <ProtectedRoute requiredPermissions={['some:permission']}>
        <div data-testid="protected-content">Protected Content</div>
      </ProtectedRoute>
    );

    // Assert
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByText('غير مصرح لك بالوصول')).not.toBeInTheDocument();
  });

  it('should render children when user can access the required module', () => {
    // Arrange: Mock that the user has module access
    usePermissions.mockReturnValue({
      hasAnyPermission: jest.fn(() => true),
      canAccessModule: jest.fn(() => true),
    });

    // Act
    render(
      <ProtectedRoute requiredModule="students">
        <div data-testid="protected-content">Protected Content</div>
      </ProtectedRoute>
    );

    // Assert
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByText('غير مصرح لك بالوصول')).not.toBeInTheDocument();
  });

  it('should show "Permission Denied" when user lacks specific permissions', () => {
    // Arrange: Mock that the user does NOT have the required permissions
    usePermissions.mockReturnValue({
      hasAnyPermission: jest.fn(() => false),
      canAccessModule: jest.fn(() => true), // Assume module access is fine for this test
    });

    // Act
    render(
      <ProtectedRoute requiredPermissions={['some:permission']}>
        <div data-testid="protected-content">Protected Content</div>
      </ProtectedRoute>
    );

    // Assert
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.getByText('غير مصرح لك بالوصول')).toBeInTheDocument();
  });

  it('should show "Permission Denied" when user cannot access the required module', () => {
    // Arrange: Mock that the user does NOT have module access
    usePermissions.mockReturnValue({
      hasAnyPermission: jest.fn(() => true),
      canAccessModule: jest.fn(() => false),
    });

    // Act
    render(
      <ProtectedRoute requiredModule="students">
        <div data-testid="protected-content">Protected Content</div>
      </ProtectedRoute>
    );

    // Assert
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.getByText('غير مصرح لك بالوصول')).toBeInTheDocument();
  });
});