import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWeather, weatherCache } from '../useWeather';

describe('useWeather Hook', () => {
  it('should initialize with loading state', () => {
    const { result } = renderHook(() => useWeather('نواكشوط'));
    
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should have a refetch function', () => {
    const { result } = renderHook(() => useWeather('نواكشوط'));
    
    expect(typeof result.current.refetch).toBe('function');
  });
});

describe('Weather Cache', () => {
  it('should store and retrieve values', () => {
    weatherCache.clear();
    const testData = { temp: 25, condition: 'صافي' };
    
    weatherCache.set('test', testData);
    const retrieved = weatherCache.get('test');
    
    expect(retrieved).toEqual(testData);
  });

  it('should clear cache', () => {
    weatherCache.set('test', { temp: 25 });
    weatherCache.clear();
    
    const retrieved = weatherCache.get('test');
    expect(retrieved).toBe(null);
  });
});
