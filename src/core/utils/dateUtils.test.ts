import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatRelative,
  toISODate,
  getDateRange,
  parseFlexibleDate,
} from './dateUtils';

describe('dateUtils', () => {
  describe('formatDate', () => {
    it('should format a Date object with ar-SA locale by default', () => {
      const date = new Date(2024, 5, 15);
      const result = formatDate(date);
      expect(result).toContain('١٥');
      expect(result).toContain('يونيو');
      expect(result).toContain('٢٠٢٤');
    });

    it('should format a Date object with en-US locale', () => {
      const date = new Date(2024, 5, 15);
      const result = formatDate(date, 'en-US');
      expect(result).toContain('June');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });

    it('should accept an ISO string', () => {
      const result = formatDate('2024-06-15', 'en-US');
      expect(result).toContain('June');
    });

    it('should throw for invalid input', () => {
      expect(() => formatDate('not-a-date')).toThrow('Invalid date');
    });
  });

  describe('formatDateTime', () => {
    it('should include time components with ar-SA locale', () => {
      const date = new Date(2024, 5, 15, 14, 30);
      const result = formatDateTime(date);
      expect(result).toContain('يونيو');
      expect(result).toContain('٢');
    });

    it('should include time components with en-US locale', () => {
      const date = new Date(2024, 5, 15, 14, 30);
      const result = formatDateTime(date, 'en-US');
      expect(result).toContain('June');
      expect(result).toMatch(/2/);
    });
  });

  describe('formatRelative', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "منذ X أيام" for past dates (Arabic)', () => {
      const result = formatRelative(new Date(2024, 5, 12), 'ar-SA');
      expect(result).toBe('منذ ٣ أيام');
    });

    it('should return "X days ago" for past dates (English)', () => {
      const result = formatRelative(new Date(2024, 5, 12), 'en-US');
      expect(result).toBe('3 days ago');
    });

    it('should handle singular units in Arabic', () => {
      const result = formatRelative(new Date(2024, 5, 14), 'ar-SA');
      expect(result).toBe('منذ ١ يوم');
    });

    it('should handle singular units in English', () => {
      const result = formatRelative(new Date(2024, 5, 14), 'en-US');
      expect(result).toBe('1 day ago');
    });

    it('should return "بعد" for future dates (Arabic)', () => {
      const result = formatRelative(new Date(2024, 5, 18, 12, 0, 0), 'ar-SA');
      expect(result).toBe('بعد ٣ أيام');
    });

    it('should return "in X days" for future dates (English)', () => {
      const result = formatRelative(new Date(2024, 5, 18, 12, 0, 0), 'en-US');
      expect(result).toBe('in 3 days');
    });

    it('should handle hours (Arabic)', () => {
      const result = formatRelative(new Date(2024, 5, 15, 8, 0), 'ar-SA');
      expect(result).toBe('منذ ٤ ساعات');
    });

    it('should handle hours (English)', () => {
      const result = formatRelative(new Date(2024, 5, 15, 8, 0), 'en-US');
      expect(result).toBe('4 hours ago');
    });

    it('should handle minutes (Arabic)', () => {
      const result = formatRelative(new Date(2024, 5, 15, 11, 55), 'ar-SA');
      expect(result).toBe('منذ ٥ دقائق');
    });

    it('should handle minutes (English)', () => {
      const result = formatRelative(new Date(2024, 5, 15, 11, 55), 'en-US');
      expect(result).toBe('5 minutes ago');
    });

    it('should return "الآن" for very recent dates (Arabic)', () => {
      const result = formatRelative(new Date(2024, 5, 15, 12, 0, 30), 'ar-SA');
      expect(result).toBe('الآن');
    });

    it('should return "just now" for very recent dates (English)', () => {
      const result = formatRelative(new Date(2024, 5, 15, 12, 0, 30), 'en-US');
      expect(result).toBe('just now');
    });

    it('should handle months (Arabic)', () => {
      const result = formatRelative(new Date(2024, 3, 1), 'ar-SA');
      expect(result).toBe('منذ ٢ أشهر');
    });

    it('should handle months (English)', () => {
      const result = formatRelative(new Date(2024, 3, 1), 'en-US');
      expect(result).toBe('2 months ago');
    });
  });

  describe('toISODate', () => {
    it('should return YYYY-MM-DD format from a Date', () => {
      const result = toISODate(new Date(2024, 5, 15));
      expect(result).toBe('2024-06-15');
    });

    it('should return YYYY-MM-DD format from an ISO string', () => {
      const result = toISODate('2024-06-15');
      expect(result).toBe('2024-06-15');
    });

    it('should zero-pad single-digit months and days', () => {
      const result = toISODate(new Date(2024, 0, 5));
      expect(result).toBe('2024-01-05');
    });
  });

  describe('getDateRange', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2024, 5, 15));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return today range with same from and to', () => {
      const result = getDateRange('today');
      expect(result.from).toBe('2024-06-15');
      expect(result.to).toBe('2024-06-15');
    });

    it('should return week range (7 days back)', () => {
      const result = getDateRange('week');
      expect(result.from).toBe('2024-06-08');
      expect(result.to).toBe('2024-06-15');
    });

    it('should return month range (1 month back)', () => {
      const result = getDateRange('month');
      expect(result.from).toBe('2024-05-15');
      expect(result.to).toBe('2024-06-15');
    });

    it('should return year range (1 year back)', () => {
      const result = getDateRange('year');
      expect(result.from).toBe('2023-06-15');
      expect(result.to).toBe('2024-06-15');
    });
  });

  describe('parseFlexibleDate', () => {
    it('should parse ISO format YYYY-MM-DD', () => {
      const result = parseFlexibleDate('2024-06-15');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2024);
      expect(result!.getMonth()).toBe(5);
      expect(result!.getDate()).toBe(15);
    });

    it('should parse Arabic month names', () => {
      const result = parseFlexibleDate('15 يناير 2024');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2024);
      expect(result!.getMonth()).toBe(0);
      expect(result!.getDate()).toBe(15);
    });

    it('should parse English month names', () => {
      const result = parseFlexibleDate('15 Jan 2024');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2024);
      expect(result!.getMonth()).toBe(0);
      expect(result!.getDate()).toBe(15);
    });

    it('should parse English full month names', () => {
      const result = parseFlexibleDate('15 January 2024');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2024);
      expect(result!.getMonth()).toBe(0);
      expect(result!.getDate()).toBe(15);
    });

    it('should parse slash-separated YYYY/MM/DD', () => {
      const result = parseFlexibleDate('2024/06/15');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2024);
      expect(result!.getMonth()).toBe(5);
      expect(result!.getDate()).toBe(15);
    });

    it('should parse slash-separated DD/MM/YYYY', () => {
      const result = parseFlexibleDate('15/06/2024');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2024);
      expect(result!.getMonth()).toBe(5);
      expect(result!.getDate()).toBe(15);
    });

    it('should parse dash-separated DD-MM-YYYY', () => {
      const result = parseFlexibleDate('15-06-2024');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2024);
      expect(result!.getMonth()).toBe(5);
      expect(result!.getDate()).toBe(15);
    });

    it('should parse space-separated DM YYYY', () => {
      const result = parseFlexibleDate('15 06 2024');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2024);
      expect(result!.getMonth()).toBe(5);
      expect(result!.getDate()).toBe(15);
    });

    it('should parse Arabic numerals in slash format', () => {
      const result = parseFlexibleDate('٢٠٢٤/٠٦/١٥');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2024);
      expect(result!.getMonth()).toBe(5);
      expect(result!.getDate()).toBe(15);
    });

    it('should parse Arabic date with Arabic numeral day', () => {
      const result = parseFlexibleDate('١٥ يناير ٢٠٢٤');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2024);
      expect(result!.getMonth()).toBe(0);
      expect(result!.getDate()).toBe(15);
    });

    it('should return null for empty string', () => {
      expect(parseFlexibleDate('')).toBeNull();
      expect(parseFlexibleDate('   ')).toBeNull();
    });

    it('should return null for unrecognizable format', () => {
      expect(parseFlexibleDate('hello world')).toBeNull();
    });

    it('should parse ISO datetime string', () => {
      const result = parseFlexibleDate('2024-06-15T10:30:00Z');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2024);
    });
  });
});
