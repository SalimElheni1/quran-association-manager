import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'react-toastify';
import DashboardPage from '@renderer/pages/DashboardPage';
import { usePermissions } from '@renderer/hooks/usePermissions';

// The shared setup mocks react-bootstrap without Modal; the page needs the real components.
jest.mock('react-bootstrap', () => jest.requireActual('react-bootstrap'));
jest.mock('@renderer/hooks/usePermissions');
jest.mock('@renderer/contexts/AuthContext', () => ({ useAuth: () => ({ token: 't' }) }));
jest.mock('@renderer/utils/logger', () => ({ error: jest.fn() }));
// The dashboard widgets load their own data; they have their own tests.
jest.mock('@renderer/components/TodaysClasses', () => {
  const TodaysClasses = () => <div data-testid="todays-classes" />;
  TodaysClasses.displayName = 'TodaysClasses';
  return TodaysClasses;
});
jest.mock('@renderer/components/QuickActions', () => {
  const QuickActions = () => <div data-testid="quick-actions" />;
  QuickActions.displayName = 'QuickActions';
  return QuickActions;
});
jest.mock('@renderer/components/dashboard/MonthlyFeesTrendChart', () => {
  const MonthlyFeesTrendChart = () => <div data-testid="fees-trend" />;
  MonthlyFeesTrendChart.displayName = 'MonthlyFeesTrendChart';
  return MonthlyFeesTrendChart;
});

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePermissions.mockReturnValue({ hasPermission: () => true });
    window.electronAPI = {
      getDashboardStats: jest
        .fn()
        .mockResolvedValue({ studentCount: 120, teacherCount: 8, classCount: 0 }),
      getBackupReminderStatus: jest.fn().mockResolvedValue({ showReminder: false }),
    };
  });

  it('shows the branch counts, including zero, once they arrive', async () => {
    render(<DashboardPage />);

    expect(await screen.findByText('120')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('...')).not.toBeInTheDocument();
  });

  it('warns about an overdue backup and links to the backup settings', async () => {
    window.electronAPI.getBackupReminderStatus.mockResolvedValue({
      showReminder: true,
      daysSinceLastBackup: 2,
    });
    render(<DashboardPage />);

    expect(
      await screen.findByText('لم تقم بإنشاء نسخة احتياطية لقاعدة البيانات منذ أكثر من يومين.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'الانتقال إلى صفحة النسخ الاحتياطي' }));
    expect(mockNavigate).toHaveBeenCalledWith('/settings', { state: { defaultTab: 'backup' } });
  });

  it('asks for a first backup when none was ever made', async () => {
    window.electronAPI.getBackupReminderStatus.mockResolvedValue({
      showReminder: true,
      daysSinceLastBackup: Infinity,
    });
    render(<DashboardPage />);

    expect(
      await screen.findByText(
        'لم يتم العثور على نسخة احتياطية سابقة. يُرجى إنشاء واحدة الآن لحماية بياناتك.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the fee trend only to users who can see the finances', async () => {
    usePermissions.mockReturnValue({ hasPermission: () => false });
    render(<DashboardPage />);
    await screen.findByText('120');

    expect(screen.queryByTestId('fees-trend')).not.toBeInTheDocument();
    expect(screen.getByTestId('todays-classes')).toBeInTheDocument();
  });

  it('tells the user when the dashboard data cannot be loaded', async () => {
    window.electronAPI.getDashboardStats.mockRejectedValue(new Error('db closed'));
    render(<DashboardPage />);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('فشل في تحميل بيانات لوحة التحكم.'),
    );
    expect(screen.getAllByText('...')).toHaveLength(3);
  });
});
