import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TodaysClasses from '@renderer/components/TodaysClasses';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('react-bootstrap', () => {
  const ListGroup = ({ children, ...props }) => (
    <div data-testid="list-group" {...props}>
      {children}
    </div>
  );
  ListGroup.Item = ({ children, onClick, ...props }) => (
    <div data-testid="list-group-item" onClick={onClick} role="button" {...props}>
      {children}
    </div>
  );
  ListGroup.Item.displayName = 'ListGroup.Item';
  const Alert = ({ children, ...props }) => <div {...props}>{children}</div>;
  const Spinner = (props) => <div {...props} />;
  return { ListGroup, Alert, Spinner };
});

describe('TodaysClasses attendance link', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    window.electronAPI.getTodaysClasses = jest
      .fn()
      .mockResolvedValue([{ id: 42, name: 'فصل التجويد', teacher_name: 'أحمد' }]);
  });

  it('navigates to the attendance page with the class id URL param', async () => {
    render(<TodaysClasses />);

    const item = await screen.findByText('فصل التجويد');
    await userEvent.click(item);

    expect(mockNavigate).toHaveBeenCalledWith('/attendance?classId=42');
  });
});
