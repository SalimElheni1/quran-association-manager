import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/renderer/App';

// Mock all page components
jest.mock('../../src/renderer/pages/DashboardPage', () => {
  return function MockDashboardPage() {
    return <div data-testid="dashboard-page">Dashboard</div>;
  };
});

jest.mock('../../src/renderer/pages/LoginPage', () => {
  return function MockLoginPage({ initialCredentials, onCloseBanner }) {
    return (
      <div data-testid="login-page">
        Login Page
        {initialCredentials && (
          <div data-testid="initial-credentials">
            {JSON.stringify(initialCredentials)}
            <button onClick={onCloseBanner}>Close</button>
          </div>
        )}
      </div>
    );
  };
});

jest.mock('../../src/renderer/pages/StudentsPage', () => {
  return function MockStudentsPage() {
    return <div data-testid="students-page">Students</div>;
  };
});

jest.mock('../../src/renderer/layouts/MainLayout', () => {
  return function MockMainLayout() {
    return <div data-testid="main-layout">Main Layout</div>;
  };
});

jest.mock('../../src/renderer/components/ProtectedRoute', () => {
  return function MockProtectedRoute({ children }) {
    return <div data-testid="protected-route">{children}</div>;
  };
});

describe('App', () => {
  let mockElectronAPI;

  beforeEach(() => {
    mockElectronAPI = {
      onShowInitialCredentials: jest.fn().mockReturnValue(() => {}),
    };
    global.window.electronAPI = mockElectronAPI;
    jest.clearAllMocks();
  });

  const renderApp = (initialEntries = ['/']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    );
  };

  it('should render login page for /login route', () => {
    renderApp(['/login']);

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it('should render protected route for root path', () => {
    renderApp(['/']);

    expect(screen.getByTestId('protected-route')).toBeInTheDocument();
    expect(screen.getByTestId('main-layout')).toBeInTheDocument();
  });

  it('should set up initial credentials listener on mount', () => {
    renderApp();

    expect(mockElectronAPI.onShowInitialCredentials).toHaveBeenCalledWith(
      expect.any(Function)
    );
  });

  it('should handle initial credentials event', async () => {
    let credentialsCallback;
    mockElectronAPI.onShowInitialCredentials.mockImplementation((callback) => {
      credentialsCallback = callback;
      return () => {};
    });

    renderApp(['/login']);

    const credentials = { username: 'admin', password: 'temp123' };
    
    // Simulate receiving initial credentials
    credentialsCallback(null, credentials);

    await waitFor(() => {
      expect(screen.getByTestId('initial-credentials')).toHaveTextContent(
        JSON.stringify(credentials)
      );
    });
  });

  it('should handle closing initial credentials banner', async () => {
    let credentialsCallback;
    mockElectronAPI.onShowInitialCredentials.mockImplementation((callback) => {
      credentialsCallback = callback;
      return () => {};
    });

    renderApp(['/login']);

    const credentials = { username: 'admin', password: 'temp123' };
    credentialsCallback(null, credentials);

    await waitFor(() => {
      expect(screen.getByTestId('initial-credentials')).toBeInTheDocument();
    });

    // Close the banner
    const closeButton = screen.getByText('Close');
    closeButton.click();

    await waitFor(() => {
      expect(screen.queryByTestId('initial-credentials')).not.toBeInTheDocument();
    });
  });

  it('should cleanup listener on unmount', () => {
    const mockCleanup = jest.fn();
    mockElectronAPI.onShowInitialCredentials.mockReturnValue(mockCleanup);

    const { unmount } = renderApp();

    unmount();

    expect(mockCleanup).toHaveBeenCalled();
  });

  it('should pass initial credentials to login page', async () => {
    let credentialsCallback;
    mockElectronAPI.onShowInitialCredentials.mockImplementation((callback) => {
      credentialsCallback = callback;
      return () => {};
    });

    renderApp(['/login']);

    const credentials = { username: 'admin', password: 'temp123' };
    credentialsCallback(null, credentials);

    await waitFor(() => {
      expect(screen.getByTestId('initial-credentials')).toBeInTheDocument();
    });
  });

  it('should not show initial credentials when none provided', () => {
    renderApp(['/login']);

    expect(screen.queryByTestId('initial-credentials')).not.toBeInTheDocument();
  });

  it('should handle multiple route changes', () => {
    const { rerender } = renderApp(['/login']);
    expect(screen.getByTestId('login-page')).toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByTestId('protected-route')).toBeInTheDocument();
  });
});