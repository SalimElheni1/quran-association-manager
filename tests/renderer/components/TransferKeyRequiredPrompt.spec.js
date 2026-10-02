import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useAuth } from '@renderer/contexts/AuthContext';
import TransferKeyRequiredPrompt from '@renderer/components/settings/TransferKeyRequiredPrompt';

// The shared setup mocks react-bootstrap without Modal: use the real components.
jest.mock('react-bootstrap', () => jest.requireActual('react-bootstrap'));
jest.mock('@renderer/contexts/AuthContext', () => ({ useAuth: jest.fn() }));

const SUPERADMIN = { id: 1, roles: ['Superadmin'] };

function mockSettings(settings) {
  window.electronAPI.getSettings = jest.fn().mockResolvedValue({ success: true, settings });
}

describe('TransferKeyRequiredPrompt', () => {
  beforeEach(() => {
    window.electronAPI.setTransferKey = jest
      .fn()
      .mockResolvedValue({ success: true, message: 'تم حفظ رمز حماية النسخ الاحتياطية.' });
  });

  it('asks the Superadmin of an install without a key, with no way to dismiss it', async () => {
    useAuth.mockReturnValue({ user: SUPERADMIN });
    mockSettings({ has_transfer_key: false });

    render(<TransferKeyRequiredPrompt />);

    expect(await screen.findByTestId('transfer-key-modal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إلغاء' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('closes once the key is saved', async () => {
    useAuth.mockReturnValue({ user: SUPERADMIN });
    mockSettings({ has_transfer_key: false });
    render(<TransferKeyRequiredPrompt />);
    await screen.findByTestId('transfer-key-modal');

    const input = (name) => document.querySelector(`input[name="${name}"]`);
    fireEvent.change(input('transfer-key-password'), { target: { value: 'my-password' } });
    fireEvent.change(input('transfer-key-new'), { target: { value: 'branch-transfer-key' } });
    fireEvent.change(input('transfer-key-confirm'), { target: { value: 'branch-transfer-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الرمز' }));

    await waitFor(() => expect(screen.queryByTestId('transfer-key-modal')).not.toBeInTheDocument());
    expect(window.electronAPI.setTransferKey).toHaveBeenCalled();
  });

  it('does not ask when a key is set', async () => {
    useAuth.mockReturnValue({ user: SUPERADMIN });
    mockSettings({ has_transfer_key: true });

    render(<TransferKeyRequiredPrompt />);

    await waitFor(() => expect(window.electronAPI.getSettings).toHaveBeenCalled());
    expect(screen.queryByTestId('transfer-key-modal')).not.toBeInTheDocument();
  });

  it('does not ask other roles', () => {
    useAuth.mockReturnValue({ user: { id: 2, roles: ['Administrator'] } });
    mockSettings({ has_transfer_key: false });

    render(<TransferKeyRequiredPrompt />);

    expect(window.electronAPI.getSettings).not.toHaveBeenCalled();
    expect(screen.queryByTestId('transfer-key-modal')).not.toBeInTheDocument();
  });
});
