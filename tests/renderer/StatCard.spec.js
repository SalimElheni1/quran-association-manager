import React from 'react';
import { render, screen } from '@testing-library/react';
import StatCard from '../../src/renderer/components/StatCard';

describe('StatCard', () => {
  const defaultProps = {
    title: 'Test Title',
    value: '100',
    icon: 'fas fa-users',
    variant: 'primary',
  };

  it('should render with all props', () => {
    render(<StatCard {...defaultProps} />);

    expect(screen.getByTestId('col')).toBeInTheDocument();
    expect(screen.getByTestId('card-title')).toHaveTextContent('Test Title');
    expect(screen.getByTestId('card-text')).toHaveTextContent('100');
    const iconElement = screen.getByTestId('col').querySelector('.fas.fa-users');
    expect(iconElement).toBeInTheDocument();
  });

  it('should show loading state when value is null', () => {
    render(<StatCard {...defaultProps} value={null} />);

    expect(screen.getByTestId('card-text')).toHaveTextContent('...');
  });

  it('should show loading state when value is undefined', () => {
    render(<StatCard {...defaultProps} value={undefined} />);

    expect(screen.getByTestId('card-text')).toHaveTextContent('...');
  });

  it('should display zero value correctly', () => {
    render(<StatCard {...defaultProps} value={0} />);

    expect(screen.getByTestId('card-text')).toHaveTextContent('0');
  });

  it('should display string values', () => {
    render(<StatCard {...defaultProps} value="Active" />);

    expect(screen.getByTestId('card-text')).toHaveTextContent('Active');
  });

  it('should apply variant class to card', () => {
    render(<StatCard {...defaultProps} variant="success" />);

    // The card should have the border class applied
    const cardElement = screen.getByTestId('col').querySelector('.stat-card');
    expect(cardElement).toHaveClass('border-success');
  });

  it('should render without crashing when minimal props provided', () => {
    render(<StatCard title="Minimal" />);

    expect(screen.getByTestId('card-title')).toHaveTextContent('Minimal');
    expect(screen.getByTestId('card-text')).toHaveTextContent('...');
  });
});