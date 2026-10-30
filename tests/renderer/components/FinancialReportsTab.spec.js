import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import FinancialReportsTab from '@renderer/components/financial/FinancialReportsTab';

// The shared setup mocks react-bootstrap without Card.Header: use the real components.
jest.mock('react-bootstrap', () => jest.requireActual('react-bootstrap'));

const card = (title) => screen.getByText(title).closest('.card');

describe('FinancialReportsTab', () => {
  beforeEach(() => {
    window.electronAPI.exportFinancialReportWord = jest.fn().mockResolvedValue({ success: true });
    window.electronAPI.exportCashLedger = jest.fn().mockResolvedValue({ cancelled: true });
    window.electronAPI.exportInventoryLedger = jest
      .fn()
      .mockResolvedValue({ success: false, message: 'لا توجد أصناف' });
  });

  it('exports the Word report for the chosen month', async () => {
    render(<FinancialReportsTab />);
    const report = within(card('التقرير المالي'));
    const [, monthSelect, yearSelect] = report.getAllByRole('combobox');
    fireEvent.change(monthSelect, { target: { value: '1' } });
    fireEvent.change(yearSelect, { target: { value: String(new Date().getFullYear()) } });

    fireEvent.click(report.getByRole('button', { name: 'تصدير التقرير المالي (Word)' }));

    const year = new Date().getFullYear();
    const lastDay = new Date(year, 2, 0).getDate();
    await waitFor(() =>
      expect(window.electronAPI.exportFinancialReportWord).toHaveBeenCalledWith({
        period: { startDate: `${year}-02-01`, endDate: `${year}-02-${lastDay}` },
      }),
    );
    expect(await report.findByText('تم تصدير التقرير المالي بنجاح!')).toBeInTheDocument();
  });

  it('asks for both dates of a custom period before exporting', async () => {
    render(<FinancialReportsTab />);
    const ledger = within(card('📒 سجل المحاسبة الشهري'));
    fireEvent.change(ledger.getAllByRole('combobox')[0], { target: { value: 'custom' } });

    fireEvent.click(ledger.getByRole('button', { name: 'تصدير سجل المحاسبة (Excel)' }));

    expect(await ledger.findByText('الرجاء تحديد تاريخ بدء وانتهاء صالحين.')).toBeInTheDocument();
    expect(window.electronAPI.exportCashLedger).not.toHaveBeenCalled();
  });

  it('each card reports its own result', async () => {
    render(<FinancialReportsTab />);
    const ledger = within(card('📒 سجل المحاسبة الشهري'));
    const inventory = within(card('سجل الجرد'));

    fireEvent.click(ledger.getByRole('button', { name: 'تصدير سجل المحاسبة (Excel)' }));
    fireEvent.click(inventory.getByRole('button', { name: 'تصدير سجل الجرد (Excel)' }));

    expect(await ledger.findByText('تم إلغاء التصدير.')).toBeInTheDocument();
    expect(await inventory.findByText('فشل التصدير: لا توجد أصناف')).toBeInTheDocument();
    expect(window.electronAPI.exportInventoryLedger).toHaveBeenCalledWith();
  });
});
