import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@renderer/App';
import '@testing-library/jest-dom';

// Mock dependencies
jest.mock('@renderer/pages/DashboardPage', () => () => <div data-testid="dashboard-page">Dashboard</div>);
jest.mock('@renderer/pages/LoginPage', () => ({ initialCredentials, onCloseBanner }) => (
  <div data-testid="login-page">
    Login Page
    {initialCredentials && <div data-testid="credentials-banner">{JSON.stringify(initialCredentials)}</div>}
    <button onClick={onCloseBanner}>Close Banner</button>
  </div>
));
jest.mock('@renderer/layouts/MainLayout', () => {
    const { Outlet } = require('react-router-dom');
    return () => <div data-testid="main-layout"><Outlet /></div>;
});
// The ProtectedRoute mock needs to be adjusted to not rely on useAuth, as App.jsx doesn't provide the AuthProvider itself
jest.mock('@renderer/components/ProtectedRoute', () => ({ children }) => <div data-testid="protected-route">{children}</div>);

describe('App Routing and Initialization', () => {
  let mockElectronAPI;

  beforeEach(() => {
    // Setup a fresh mock for each test
    mockElectronAPI = {
      getInitialCredentials: jest.fn().mockResolvedValue(null),
      clearInitialCredentials: jest.fn(),
      onShowInitialCredentials: jest.fn(() => () => {}), // Keep for other potential tests if needed
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

  it('should fetch initial credentials on mount', async () => {
    await act(async () => {
      renderApp();
    });
    expect(mockElectronAPI.getInitialCredentials).toHaveBeenCalledTimes(1);
  });

  it('should pass initial credentials to LoginPage', async () => {
    const credentials = { username: 'superadmin', password: '123' };
    mockElectronAPI.getInitialCredentials.mockResolvedValue(credentials);

    await act(async () => {
      renderApp(['/login']);
    });

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    const banner = screen.getByTestId('credentials-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toBe(JSON.stringify(credentials));
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