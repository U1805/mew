import type { Locale } from '../i18n';
import { formatDateTime, getRelativeDay } from './dateTime';

interface DividerTimestampOptions {
  locale: Locale;
  yesterdayLabel: string;
}

/**
 * Formats a date for display as a separator in the message list.
 * @param date The date to format.
 * @returns A formatted string (e.g., "Today", "Yesterday", "October 27, 2023").
 */
export const formatDividerTimestamp = (date: Date, options: DividerTimestampOptions): string => {
  const relativeDay = getRelativeDay(date);
  if (relativeDay === 'today') {
    return formatDateTime(date, options.locale, { hour: 'numeric', minute: '2-digit' });
  }
  if (relativeDay === 'yesterday') {
    return `${options.yesterdayLabel}, ${formatDateTime(date, options.locale, { hour: 'numeric', minute: '2-digit' })}`;
  }
  return formatDateTime(date, options.locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};
