import React from 'react';
import { SUPPORTED_LOCALES, useI18n, type Locale } from '../i18n';

interface LanguageSelectorProps {
  className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ className }) => {
  const { locale, setLocale, t } = useI18n();

  return (
    <select
      className={className}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      aria-label={t('account.language')}
    >
      {SUPPORTED_LOCALES.map((item) => (
        <option key={item} value={item}>
          {t(`lang.${item}`)}
        </option>
      ))}
    </select>
  );
};
