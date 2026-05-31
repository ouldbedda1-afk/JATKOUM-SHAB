import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';

describe('ErrorBoundary Component', () => {
  const ThrowError = () => {
    throw new Error('Test error');
  };

  const ValidComponent = () => {
    return <div>Valid Component</div>;
  };

  beforeEach(() => {
    // صامت تنبيهات الخطأ في الاختبار
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ValidComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Valid Component')).toBeTruthy();
  });

  it('displays error message when error is thrown', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('حدث خطأ ما')).toBeTruthy();
  });

  it('has a retry button', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const retryButton = screen.getByText('إعادة المحاولة');
    expect(retryButton).toBeTruthy();
  });

  it('has home link button', () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const homeButton = screen.getByText('العودة للصفحة الرئيسية');
    expect(homeButton).toBeTruthy();
  });
});
