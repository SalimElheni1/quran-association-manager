import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import MonthlyFeesTrendChart from '@renderer/components/dashboard/MonthlyFeesTrendChart';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { toLocalISODate } from '@renderer/utils/dates';

jest.mock('@renderer/hooks/usePermissions');
// The shared setup mocks react-bootstrap without Card.Header/Spinner; ChartCard needs the real ones.
jest.mock('react-bootstrap', () => jest.requireActual('react-bootstrap'));
// ChartCard imports a stylesheet that is not in the repo yet (dashboard charts are work in progress).
jest.mock('../../../src/renderer/components/dashboard/Charts.css', () => ({}), { virtual: true });

describe('MonthlyFeesTrendChart', () => {
  beforeEach(() => {
    window.electronAPI = { getPayments: jest.fn() };
  });

  it('buckets a payment made today into the current month', async () => {
    usePermissions.mockReturnValue({ hasPermission: () => true });
    window.electronAPI.getPayments.mockResolvedValue([
      { payment_date: toLocalISODate(new Date()), amount: 75 },
    ]);

    const { container } = render(<MonthlyFeesTrendChart />);

    await waitFor(() => expect(container.querySelectorAll('rect title').length).toBe(12));
    const titles = [...container.querySelectorAll('rect title')].map((t) => t.textContent);
    expect(titles[titles.length - 1]).toContain(': 75 ');
    expect(titles.slice(0, -1).every((t) => t.includes(': 0 '))).toBe(true);
  });

  it('renders nothing and does not fetch without the financials permission', () => {
    usePermissions.mockReturnValue({ hasPermission: () => false });

    const { container } = render(<MonthlyFeesTrendChart />);

    expect(container).toBeEmptyDOMElement();
    expect(window.electronAPI.getPayments).not.toHaveBeenCalled();
  });
});
