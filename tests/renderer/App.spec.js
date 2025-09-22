import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@renderer/App';
import '@testing-library/jest-dom';

// Mock all page components and layouts
jest.mock('@renderer/pages/DashboardPage', () => () => <div data-testid="dashboard-page">Dashboard</div>);
jest.mock('@renderer/pages/LoginPage', () => () => <div data-testid="login-page">Login Page</div>);
// Correctly mock MainLayout to render child routes via an Outlet
jest.mock('@renderer/layouts/MainLayout', () => () => {
    const { Outlet } = require('react-router-dom');
    return <div data-testid="main-layout"><Outlet /></div>;
});
jest.mock('@renderer/components/ProtectedRoute', () => ({ children }) => <div data-testid="protected-route">{children}</div>);


describe('App Routing and Initialization', () => {
  let mockElectronAPI;

  beforeEach(() => {
    mockElectronAPI = {
      onShowInitialCredentials: jest.fn(() => () => {}), // Return a cleanup function
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

  it('should render login page for the /login route', () => {
    renderApp(['/login']);
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-route')).not.toBeInTheDocument();
  });

  it('should render protected content behind MainLayout for the root path', () => {
    renderApp(['/']);
    expect(screen.getByTestId('protected-route')).toBeInTheDocument();
    expect(screen.getByTestId('main-layout')).toBeInTheDocument();
    // The DashboardPage is the default child of MainLayout in the App's route config
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('should set up an initial credentials listener on mount', () => {
    renderApp();
    expect(mockElectronAPI.onShowInitialCredentials).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should call the cleanup function when the component unmounts', () => {
    const mockCleanup = jest.fn();
    mockElectronAPI.onShowInitialCredentials.mockReturnValue(mockCleanup);
    const { unmount } = renderApp();
    unmount();
    expect(mockCleanup).toHaveBeenCalled();
  });
});
