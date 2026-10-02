import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import TransferKeyCard from '@renderer/components/settings/TransferKeyCard';

// The shared setup mocks react-bootstrap without Modal or Badge: use the real components.
jest.mock('react-bootstrap', () => jest.requireActual('react-bootstrap'));

const LABEL = 'رمز حماية النسخ الاحتياطية (رمز النقل)';

function renderCard(props = {}) {
  const onChanged = jest.fn();
  render(<TransferKeyCard label={LABEL} hasKey canManage onChanged={onChanged} {...props} />);
  return { onChanged };
}

function inputNamed(name) {
  return document.querySelector(`input[name="${name}"]`);
}

describe('TransferKeyCard', () => {
  beforeEach(() => {
    window.electronAPI.revealTransferKey = jest
      .fn()
      .mockResolvedValue({ success: true, key: 'branch-transfer-key' });
    window.electronAPI.setTransferKey = jest
      .fn()
      .mockResolvedValue({ success: true, message: 'تم حفظ رمز حماية النسخ الاحتياطية.' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never shows the key until the Superadmin types their password', async () => {
    renderCard();

    expect(screen.getByTestId('transfer-key-status')).toHaveTextContent('تم تعيين الرمز');
    expect(screen.queryByTestId('transfer-key-value')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'عرض الرمز' }));
    fireEvent.change(await screen.findByPlaceholderText('أدخل كلمة المرور الخاصة بك'), {
      target: { value: 'my-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد' }));

    expect(await screen.findByTestId('transfer-key-value')).toHaveTextContent(
      'branch-transfer-key',
    );
    expect(window.electronAPI.revealTransferKey).toHaveBeenCalledWith({ password: 'my-password' });
  });

  it('hides the revealed key again after 30 seconds', async () => {
    // Fake from the start: the countdown's first timeout is set as soon as the key shows.
    jest.useFakeTimers();
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'عرض الرمز' }));
    fireEvent.change(await screen.findByPlaceholderText('أدخل كلمة المرور الخاصة بك'), {
      target: { value: 'my-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد' }));
    await screen.findByTestId('transfer-key-value');

    for (let i = 0; i < 31; i += 1) {
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    }

    expect(screen.queryByTestId('transfer-key-value')).not.toBeInTheDocument();
  });

  it('does not show the key when the password is wrong', async () => {
    window.electronAPI.revealTransferKey.mockResolvedValue({
      success: false,
      message: 'كلمة المرور الحالية التي أدخلتها غير صحيحة.',
    });
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'عرض الرمز' }));
    fireEvent.change(await screen.findByPlaceholderText('أدخل كلمة المرور الخاصة بك'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد' }));

    await waitFor(() => expect(window.electronAPI.revealTransferKey).toHaveBeenCalled());
    expect(screen.queryByTestId('transfer-key-value')).not.toBeInTheDocument();
  });

  it('changes the key with the password and the new key typed twice', async () => {
    const { onChanged } = renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'تغيير الرمز' }));
    await screen.findByTestId('transfer-key-modal');
    fireEvent.change(inputNamed('transfer-key-password'), { target: { value: 'my-password' } });
    fireEvent.change(inputNamed('transfer-key-new'), { target: { value: 'new-branch-key' } });
    fireEvent.change(inputNamed('transfer-key-confirm'), { target: { value: 'new-branch-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الرمز' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(window.electronAPI.setTransferKey).toHaveBeenCalledWith({
      password: 'my-password',
      key: 'new-branch-key',
      confirmKey: 'new-branch-key',
    });
  });

  it('refuses a mismatched confirmation before calling the main process', async () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'تغيير الرمز' }));
    await screen.findByTestId('transfer-key-modal');
    fireEvent.change(inputNamed('transfer-key-password'), { target: { value: 'my-password' } });
    fireEvent.change(inputNamed('transfer-key-new'), { target: { value: 'new-branch-key' } });
    fireEvent.change(inputNamed('transfer-key-confirm'), { target: { value: 'new-branch-kez' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ الرمز' }));

    expect(
      await screen.findByText('رمزا حماية النسخ الاحتياطية غير متطابقين.'),
    ).toBeInTheDocument();
    expect(window.electronAPI.setTransferKey).not.toHaveBeenCalled();
  });

  it('only shows the status to roles other than the Superadmin', () => {
    renderCard({ canManage: false, hasKey: false });

    expect(screen.getByTestId('transfer-key-status')).toHaveTextContent('لم يتم تعيين الرمز');
    expect(screen.getByText(/اطلب من مدير النظام تعيينه/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'عرض الرمز' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعيين الرمز' })).not.toBeInTheDocument();
  });
});
