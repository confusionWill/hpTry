import { createI18n } from 'vue-i18n'

import en from './en.json'
import zhCN from './zh-CN.json'

export const APP_LOCALES = ['zh-CN', 'en'] as const
export type AppLocale = (typeof APP_LOCALES)[number]

const localeStorageKey = 'hp-try-locale'

function isAppLocale(value: string | null): value is AppLocale {
  return APP_LOCALES.some((locale) => locale === value)
}

export function getInitialAppLocale(): AppLocale {
  try {
    const savedLocale = window.localStorage.getItem(localeStorageKey)

    if (isAppLocale(savedLocale)) {
      return savedLocale
    }
  } catch {
    // Keep the default locale when browser storage is unavailable.
  }

  return 'zh-CN'
}

export function persistAppLocale(locale: AppLocale): void {
  try {
    window.localStorage.setItem(localeStorageKey, locale)
  } catch {
    // The language still applies for the current session when storage is unavailable.
  }
}

const initialLocale = getInitialAppLocale()

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages: {
    'zh-CN': zhCN,
    en,
  },
})

if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLocale
}
