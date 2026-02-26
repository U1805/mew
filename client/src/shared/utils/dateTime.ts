import type { Locale } from '../i18n';

type DateInput = Date | string | number;

const INTL_LOCALE_MAP: Record<Locale, string> = {
  en: 'en-US',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  ja: 'ja-JP',
};

const toDate = (value: DateInput): Date | null => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const toIntlLocale = (locale: Locale): string => INTL_LOCALE_MAP[locale] ?? 'en-US';

export const formatDateTime = (
  value: DateInput,
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
  fallback = '',
): string => {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(toIntlLocale(locale), options).format(date);
};

export const formatNumber = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(toIntlLocale(locale)).format(value);

export type RelativeDay = 'today' | 'yesterday' | 'other';

export const getRelativeDay = (value: DateInput, now: Date = new Date()): RelativeDay => {
  const date = toDate(value);
  if (!date) return 'other';

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  if (date >= startOfToday && date < startOfTomorrow) return 'today';

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (date >= startOfYesterday && date < startOfToday) return 'yesterday';

  return 'other';
};
