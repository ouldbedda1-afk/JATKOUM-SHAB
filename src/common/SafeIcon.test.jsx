import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SafeIcon from '../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';

describe('SafeIcon Component', () => {
  it('renders an icon when provided', () => {
    const { FiSun } = FiIcons;
    render(<SafeIcon icon={FiSun} data-testid="test-icon" />);
    
    const icon = screen.getByTestId('test-icon');
    expect(icon).toBeTruthy();
  });

  it('renders alert icon as fallback when no icon provided', () => {
    render(<SafeIcon data-testid="fallback-icon" />);
    
    const icon = screen.getByTestId('fallback-icon');
    expect(icon).toBeTruthy();
  });

  it('passes through props to icon component', () => {
    const { FiCloud } = FiIcons;
    render(
      <SafeIcon 
        icon={FiCloud} 
        className="text-4xl text-blue-500"
        data-testid="styled-icon"
      />
    );
    
    const icon = screen.getByTestId('styled-icon');
    expect(icon.className).toContain('text-4xl');
  });
});
