import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@renderer/App';
import '@testing-library/jest-dom';

// Mock dependencies
jest.mock('@renderer/pages/DashboardPage', () => {
  const DashboardPage = () => <div data-testid="dashboard-page">Dashboard</div>;
  DashboardPage.displayName = 'DashboardPage';
  return DashboardPage;
});
jest.mock('@renderer/pages/LoginPage', () => {
  const LoginPage = ({ needsSetup }) => (
    <div data-testid="login-page">
      Login Page
      {needsSetup && <div data-testid="needs-setup">setup-required</div>}
    </div>
  );
  LoginPage.displayName = 'LoginPage';
  return LoginPage;
});
jest.mock('@renderer/layouts/MainLayout', () => {
  const { Outlet } = require('react-router-dom');
  const MainLayout = () => (
    <div data-testid="main-layout">
      <Outlet />
    </div>
  );
  MainLayout.displayName = 'MainLayout';
  return MainLayout;
});
// The ProtectedRoute mock needs to be adjusted to not rely on useAuth, as App.jsx doesn't provide the AuthProvider itself
jest.mock('@renderer/components/ProtectedRoute', () => {
  const ProtectedRoute = ({ children }) => <div data-testid="protected-route">{children}</div>;
  ProtectedRoute.displayName = 'ProtectedRoute';
  return ProtectedRoute;
});

describe('App Routing and Initialization', () => {
  let mockElectronAPI;

  beforeEach(() => {
    // Setup a fresh mock for each test
    mockElectronAPI = {
      getInitialCredentials: jest.fn().mockResolvedValue(null),
      onImportCompleted: jest.fn(() => () => {}),
      onShowInitialCredentials: jest.fn(() => () => {}), // Keep for other potential tests if needed
    };
    global.window.electronAPI = mockElectronAPI;
    jest.clearAllMocks();
  });

  const renderApp = (initialEntries = ['/']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>,
    );
  };

  it('should check the superadmin setup state on mount', async () => {
    await act(async () => {
      renderApp();
    });
    expect(mockElectronAPI.getInitialCredentials).toHaveBeenCalledTimes(1);
  });

  it('should pass needsSetup=true to LoginPage when no superadmin exists', async () => {
    mockElectronAPI.getInitialCredentials.mockResolvedValue({ needsSetup: true });

    await act(async () => {
      renderApp(['/login']);
    });

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.getByTestId('needs-setup')).toBeInTheDocument();
  });

  it('should not require setup when a superadmin already exists', async () => {
    mockElectronAPI.getInitialCredentials.mockResolvedValue(null);

    await act(async () => {
      renderApp(['/login']);
    });

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('needs-setup')).not.toBeInTheDocument();
  });

  it('should re-check setup state after a DB import', async () => {
    let importHandler;
    mockElectronAPI.onImportCompleted.mockImplementation((callback) => {
      importHandler = callback;
      return () => {};
    });
    mockElectronAPI.getInitialCredentials.mockResolvedValueOnce({ needsSetup: true });

    await act(async () => {
      renderApp(['/login']);
    });
    expect(screen.getByTestId('needs-setup')).toBeInTheDocument();

    mockElectronAPI.getInitialCredentials.mockResolvedValueOnce(null);
    await act(async () => {
      importHandler({});
    });

    expect(screen.queryByTestId('needs-setup')).not.toBeInTheDocument();
  });

  it('should render the login page for the /login route', async () => {
    await act(async () => {
      renderApp(['/login']);
    });
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-route')).not.toBeInTheDocument();
  });

  it('should render protected content for the root path', async () => {
    await act(async () => {
      renderApp(['/']);
    });
    expect(screen.getByTestId('protected-route')).toBeInTheDocument();
    expect(screen.getByTestId('main-layout')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
  });
});
