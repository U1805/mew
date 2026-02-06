import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { enMessages } from './messages/en';
import { zhCNMessages } from './messages/zh-CN';
import { zhTWMessages } from './messages/zh-TW';
import { jaMessages } from './messages/ja';

export const SUPPORTED_LOCALES = ['en', 'zh-CN', 'zh-TW', 'ja'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type TranslateParams = Record<string, string | number>;

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: string, params?: TranslateParams) => string;
}

const STORAGE_KEY = 'mew_locale';

const messages: Record<Locale, Record<string, string>> = {
  en: enMessages,
  'zh-CN': zhCNMessages,
  'zh-TW': zhTWMessages,
  ja: jaMessages,
};

const normalizeLocale = (raw?: string | null): Locale | null => {
  if (!raw) return null;
  if (SUPPORTED_LOCALES.includes(raw as Locale)) return raw as Locale;
  const lower = raw.toLowerCase();
  if (lower.startsWith('zh-cn') || lower.startsWith('zh-sg') || lower === 'zh-hans') return 'zh-CN';
  if (
    lower.startsWith('zh-tw') ||
    lower.startsWith('zh-hk') ||
    lower.startsWith('zh-mo') ||
    lower === 'zh-hant'
  ) {
    return 'zh-TW';
  }
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('en')) return 'en';
  return null;
};

export const getBrowserLocale = (): Locale => {
  if (typeof window === 'undefined') return 'en';
  const browserLocales = window.navigator.languages?.length ? window.navigator.languages : [window.navigator.language];
  for (const lang of browserLocales) {
    const normalized = normalizeLocale(lang);
    if (normalized) return normalized;
  }
  return 'en';
};

const getInitialLocale = (): Locale => {
  if (typeof window === 'undefined') return 'en';

  const stored = normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  if (stored) return stored;

  return getBrowserLocale();
};

const interpolate = (template: string, params?: TranslateParams): string => {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
};

export const translateWithLocale = (locale: Locale, key: string, params?: TranslateParams): string => {
  const text = messages[locale][key] ?? messages.en[key] ?? key;
  return interpolate(text, params);
};

const fallbackContext: I18nContextValue = {
  locale: 'en',
  setLocale: () => undefined,
  t: (key, params) => translateWithLocale('en', key, params),
};

const I18nContext = createContext<I18nContextValue>(fallbackContext);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => getInitialLocale());

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  };

  const value = useMemo<I18nContextValue>(() => {
    const t = (key: string, params?: TranslateParams) => translateWithLocale(locale, key, params);

    return { locale, setLocale, t };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => useContext(I18nContext);
