import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PasswordInput from '../../src/renderer/components/PasswordInput';

describe('PasswordInput', () => {
  const defaultProps = {
    name: 'password',
    value: '',
    onChange: jest.fn(),
    placeholder: 'Enter password',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with default props', () => {
    const { container } = render(<PasswordInput {...defaultProps} />);

    expect(screen.getByTestId('form-group')).toBeInTheDocument();
    expect(screen.getByTestId('form-label')).toHaveTextContent('كلمة المرور');
    expect(screen.getByTestId('form-control')).toHaveAttribute('type', 'password');
    expect(screen.getByTestId('form-control')).toHaveAttribute('placeholder', 'Enter password');
    const eyeIcon = container.querySelector('svg');
    expect(eyeIcon).toBeInTheDocument();
    expect(eyeIcon).toHaveAttribute('viewBox', '0 0 576 512');
  });

  it('should render with custom label', () => {
    render(<PasswordInput {...defaultProps} label="Custom Password" />);

    expect(screen.getByTestId('form-label')).toHaveTextContent('Custom Password');
  });

  it('should render without label when label is null', () => {
    render(<PasswordInput {...defaultProps} label={null} />);

    expect(screen.queryByTestId('form-label')).not.toBeInTheDocument();
  });

  it('should toggle password visibility', () => {
    const { container } = render(<PasswordInput {...defaultProps} />);

    const input = screen.getByTestId('form-control');
    const toggleButton = screen.getByTestId('button');

    // Initially password type
    expect(input).toHaveAttribute('type', 'password');
    let eyeIcon = container.querySelector('svg');
    expect(eyeIcon).toHaveAttribute('viewBox', '0 0 576 512');

    // Click to show password
    fireEvent.click(toggleButton);
    expect(input).toHaveAttribute('type', 'text');
    eyeIcon = container.querySelector('svg');
    expect(eyeIcon).toHaveAttribute('viewBox', '0 0 640 512');

    // Click to hide password
    fireEvent.click(toggleButton);
    expect(input).toHaveAttribute('type', 'password');
    eyeIcon = container.querySelector('svg');
    expect(eyeIcon).toHaveAttribute('viewBox', '0 0 576 512');
  });

  it('should call onChange when input value changes', () => {
    const mockOnChange = jest.fn();
    render(<PasswordInput {...defaultProps} onChange={mockOnChange} />);

    const input = screen.getByTestId('form-control');
    fireEvent.change(input, { target: { value: 'newpassword' } });

    expect(mockOnChange).toHaveBeenCalled();
  });

  it('should render help text when provided', () => {
    render(<PasswordInput {...defaultProps} helpText="Password must be 8 characters" />);

    expect(screen.getByTestId('form-text')).toHaveTextContent('Password must be 8 characters');
  });

  it('should apply custom className', () => {
    render(<PasswordInput {...defaultProps} className="custom-class" />);

    expect(screen.getByTestId('form-group')).toHaveClass('custom-class');
  });

  it('should pass through additional props', () => {
    render(<PasswordInput {...defaultProps} required disabled />);

    const input = screen.getByTestId('form-control');
    expect(input).toHaveAttribute('required');
    expect(input).toHaveAttribute('disabled');
  });

  it('should display current value', () => {
    render(<PasswordInput {...defaultProps} value="testpassword" />);

    const input = screen.getByTestId('form-control');
    expect(input).toHaveValue('testpassword');
  });
});