import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getWeatherDescription, 
  getWeatherIcon, 
  searchCities 
} from '../weatherApi';

describe('Weather API Utilities', () => {
  describe('getWeatherDescription', () => {
    it('returns correct description for sunny weather (code 0)', () => {
      expect(getWeatherDescription(0)).toBe('صافي');
    });

    it('returns correct description for rainy weather (code 61)', () => {
      expect(getWeatherDescription(61)).toBe('مطر خفيف');
    });

    it('returns correct description for snowy weather (code 71)', () => {
      expect(getWeatherDescription(71)).toBe('ثلج خفيف');
    });

    it('returns unknown for unrecognized code', () => {
      expect(getWeatherDescription(999)).toBe('غير معروف');
    });
  });

  describe('getWeatherIcon', () => {
    it('returns sun emoji for clear weather', () => {
      expect(getWeatherIcon(0)).toBe('☀️');
    });

    it('returns cloud emoji for overcast weather', () => {
      expect(getWeatherIcon(3)).toBe('☁️');
    });

    it('returns rain emoji for rainy weather', () => {
      expect(getWeatherIcon(61)).toBe('🌧️');
    });

    it('returns snow emoji for snowy weather', () => {
      expect(getWeatherIcon(71)).toBe('❄️');
    });

    it('returns thunderstorm emoji for thunderstorm', () => {
      expect(getWeatherIcon(95)).toBe('⛈️');
    });
  });

  describe('searchCities', () => {
    it('returns empty array for query less than 2 characters', async () => {
      const result = await searchCities('ن');
      expect(result).toEqual([]);
    });

    it('searches for cities containing query', async () => {
      const result = await searchCities('نوا');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toContain('نوا');
    });

    it('returns empty array for non-matching query', async () => {
      const result = await searchCities('xyz');
      expect(result).toEqual([]);
    });
  });
});
