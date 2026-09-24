import React from 'react';
import { render, waitFor } from '@testing-library/react';
import MonthlyFeesTrendChart from '@renderer/components/dashboard/MonthlyFeesTrendChart';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { toLocalISODate } from '@renderer/utils/dates';

jest.mock('@renderer/hooks/usePermissions');
// The shared setup mocks react-bootstrap without Card.Header/Spinner; ChartCard needs the real ones.
jest.mock('react-bootstrap', () => jest.requireActual('react-bootstrap'));

const emptySummary = { incomeByCategory: [], expensesByCategory: [] };

function barTitles(container) {
  return [...container.querySelectorAll('rect title')].map((t) => t.textContent);
}

describe('MonthlyFeesTrendChart', () => {
  beforeEach(() => {
    window.electronAPI = { getFinancialSummary: jest.fn() };
  });

  it('asks for one summary per calendar month, ending with the current month', async () => {
    usePermissions.mockReturnValue({ hasPermission: () => true });
    window.electronAPI.getFinancialSummary.mockResolvedValue(emptySummary);

    render(<MonthlyFeesTrendChart />);

    await waitFor(() => expect(window.electronAPI.getFinancialSummary).toHaveBeenCalledTimes(12));
    const now = new Date();
    const lastPeriod = window.electronAPI.getFinancialSummary.mock.calls[11][0];
    expect(lastPeriod).toEqual({
      startDate: toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
      endDate: toLocalISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    });
  });

  it('shows fee income net of fee refunds, ignoring other categories', async () => {
    usePermissions.mockReturnValue({ hasPermission: () => true });
    window.electronAPI.getFinancialSummary.mockImplementation(async (period) => {
      const now = new Date();
      if (period.startDate !== toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1))) {
        return emptySummary;
      }
      return {
        incomeByCategory: [
          { category: 'رسوم الطلاب', total: 170 },
          { category: 'التبرعات النقدية', total: 500 },
        ],
        expensesByCategory: [
          { category: 'استرجاع رسوم', total: 50 },
          { category: 'نفقات متنوعة', total: 80 },
        ],
      };
    });

    const { container } = render(<MonthlyFeesTrendChart />);

    await waitFor(() => expect(barTitles(container)).toHaveLength(12));
    const titles = barTitles(container);
    expect(titles[11]).toContain(': 120 ');
    expect(titles.slice(0, 11).every((t) => t.includes(': 0 '))).toBe(true);
  });

  it('renders nothing and does not fetch without the financials permission', () => {
    usePermissions.mockReturnValue({ hasPermission: () => false });

    const { container } = render(<MonthlyFeesTrendChart />);

    expect(container).toBeEmptyDOMElement();
    expect(window.electronAPI.getFinancialSummary).not.toHaveBeenCalled();
  });
});
