import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatDividerTimestamp } from './date';

describe('formatDividerTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats today as time only', () => {
    const now = new Date(2023, 0, 2, 12, 0, 0); // 12:00 PM (local time)
    vi.setSystemTime(now);
    expect(
      formatDividerTimestamp(new Date(2023, 0, 2, 12, 0, 0), { locale: 'en', yesterdayLabel: 'Yesterday' }),
    ).toBe('12:00 PM');
  });

  it('formats yesterday with Yesterday prefix', () => {
    const now = new Date(2023, 0, 2, 12, 0, 0);
    vi.setSystemTime(now);
    expect(
      formatDividerTimestamp(new Date(2023, 0, 1, 1, 5, 0), { locale: 'en', yesterdayLabel: 'Yesterday' }),
    ).toBe('Yesterday, 1:05 AM');
  });

  it('formats older dates with full date + time', () => {
    const now = new Date(2023, 0, 2, 12, 0, 0);
    vi.setSystemTime(now);
    const formatted = formatDividerTimestamp(new Date(2022, 9, 27, 6, 30, 0), {
      locale: 'en',
      yesterdayLabel: 'Yesterday',
    });
    expect(formatted).toContain('October 27, 2022');
    expect(formatted).toContain('6:30 AM');
  });
});
