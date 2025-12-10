import { format, isToday, isYesterday } from 'date-fns';

/**
 * Formats a date for display as a separator in the message list.
 * @param date The date to format.
 * @returns A formatted string (e.g., "Today", "Yesterday", "October 27, 2023").
 */
export const formatDividerTimestamp = (date: Date): string => {
  if (isToday(date)) {
    return format(date, 'h:mm a');
  }
  if (isYesterday(date)) {
    return `Yesterday, ${format(date, 'h:mm a')}`;
  }
  return format(date, 'MMMM d, yyyy, h:mm a');
};
