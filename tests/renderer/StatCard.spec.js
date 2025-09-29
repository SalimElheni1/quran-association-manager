import React from 'react';
import { render, screen } from '@testing-library/react';
import StatCard from '../../src/renderer/components/StatCard';

// Mock the icon components used by StatCard
jest.mock('../../src/renderer/components/icons/UserGraduateIcon', () => () => <svg data-testid="user-graduate-icon" />);
jest.mock('../../src/renderer/components/icons/TeacherIcon', () => () => <svg data-testid="teacher-icon" />);
jest.mock('../../src/renderer/components/icons/ClassesIcon', () => () => <svg data-testid="classes-icon" />);

describe('StatCard', () => {
  const defaultProps = {
    title: 'Test Title',
    value: '100',
    icon: 'user-graduate', // Use a valid icon key
    variant: 'primary',
  };

  it('should render with all props and the correct icon', () => {
    render(<StatCard {...defaultProps} />);

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    // Check that the correct mock icon is rendered
    expect(screen.getByTestId('user-graduate-icon')).toBeInTheDocument();
  });

  it('should show loading state when value is null', () => {
    render(<StatCard {...defaultProps} value={null} />);
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should show loading state when value is undefined', () => {
    render(<StatCard {...defaultProps} value={undefined} />);
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should display zero value correctly', () => {
    render(<StatCard {...defaultProps} value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('should display string values', () => {
    render(<StatCard {...defaultProps} value="Active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should apply variant class to card', () => {
    const { container } = render(<StatCard {...defaultProps} variant="success" />);
    const cardElement = container.querySelector('.stat-card');
    expect(cardElement).toHaveClass('border-success');
  });

  it('should render without crashing and with no icon when minimal props are provided', () => {
    const { container } = render(<StatCard title="Minimal" />);
    expect(screen.getByText('Minimal')).toBeInTheDocument();
    expect(screen.getByText('...')).toBeInTheDocument();
    // No icon prop was passed, so no SVG should be in the document
    const iconElement = container.querySelector('svg');
    expect(iconElement).not.toBeInTheDocument();
  });
});