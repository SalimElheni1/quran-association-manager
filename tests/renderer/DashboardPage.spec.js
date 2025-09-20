import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// Mock the DashboardPage component
const DashboardPage = () => {
  const [stats, setStats] = React.useState({
    students: null,
    teachers: null,
    classes: null,
    attendance: null,
  });

  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await window.electronAPI.getDashboardStats();
        if (response.success) {
          setStats(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      }
    };

    fetchStats();
  }, []);

  return (
    <div data-testid="dashboard-page">
      <h1>لوحة التحكم</h1>
      <div data-testid="stats-container">
        <div data-testid="students-stat">الطلاب: {stats.students ?? '...'}</div>
        <div data-testid="teachers-stat">المعلمون: {stats.teachers ?? '...'}</div>
        <div data-testid="classes-stat">الفصول: {stats.classes ?? '...'}</div>
        <div data-testid="attendance-stat">الحضور: {stats.attendance ?? '...'}</div>
      </div>
    </div>
  );
};

describe('DashboardPage', () => {
  let mockElectronAPI;

  beforeEach(() => {
    mockElectronAPI = {
      getDashboardStats: jest.fn(),
    };
    global.window.electronAPI = mockElectronAPI;
    jest.clearAllMocks();
  });

  it('should render dashboard page', () => {
    mockElectronAPI.getDashboardStats.mockResolvedValue({
      success: true,
      data: { students: 100, teachers: 10, classes: 5, attendance: 85 },
    });

    render(<DashboardPage />);

    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.getByText('لوحة التحكم')).toBeInTheDocument();
    expect(screen.getByTestId('stats-container')).toBeInTheDocument();
  });

  it('should show loading state initially', () => {
    mockElectronAPI.getDashboardStats.mockResolvedValue({
      success: true,
      data: { students: 100, teachers: 10, classes: 5, attendance: 85 },
    });

    render(<DashboardPage />);

    expect(screen.getByTestId('students-stat')).toHaveTextContent('الطلاب: ...');
    expect(screen.getByTestId('teachers-stat')).toHaveTextContent('المعلمون: ...');
    expect(screen.getByTestId('classes-stat')).toHaveTextContent('الفصول: ...');
    expect(screen.getByTestId('attendance-stat')).toHaveTextContent('الحضور: ...');
  });

  it('should display stats when loaded successfully', async () => {
    mockElectronAPI.getDashboardStats.mockResolvedValue({
      success: true,
      data: { students: 100, teachers: 10, classes: 5, attendance: 85 },
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByTestId('students-stat')).toHaveTextContent('الطلاب: 100');
      expect(screen.getByTestId('teachers-stat')).toHaveTextContent('المعلمون: 10');
      expect(screen.getByTestId('classes-stat')).toHaveTextContent('الفصول: 5');
      expect(screen.getByTestId('attendance-stat')).toHaveTextContent('الحضور: 85');
    });

    expect(mockElectronAPI.getDashboardStats).toHaveBeenCalledTimes(1);
  });

  it('should handle API failure gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockElectronAPI.getDashboardStats.mockRejectedValue(new Error('API Error'));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch dashboard stats:', expect.any(Error));
    });

    // Should still show loading state
    expect(screen.getByTestId('students-stat')).toHaveTextContent('الطلاب: ...');

    consoleSpy.mockRestore();
  });

  it('should handle unsuccessful API response', async () => {
    mockElectronAPI.getDashboardStats.mockResolvedValue({
      success: false,
      message: 'Failed to fetch stats',
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(mockElectronAPI.getDashboardStats).toHaveBeenCalled();
    });

    // Should still show loading state when API returns success: false
    expect(screen.getByTestId('students-stat')).toHaveTextContent('الطلاب: ...');
  });

  it('should fetch stats on component mount', () => {
    mockElectronAPI.getDashboardStats.mockResolvedValue({
      success: true,
      data: { students: 0, teachers: 0, classes: 0, attendance: 0 },
    });

    render(<DashboardPage />);

    expect(mockElectronAPI.getDashboardStats).toHaveBeenCalledTimes(1);
  });
});