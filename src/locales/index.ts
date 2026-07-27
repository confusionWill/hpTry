import { createI18n } from 'vue-i18n'

import en from './en.json'
import zhCN from './zh-CN.json'

export const APP_LOCALES = ['zh-CN', 'en'] as const
export type AppLocale = (typeof APP_LOCALES)[number]

const localeStorageKey = 'hp-try-locale'

function isAppLocale(value: string | null): value is AppLocale {
  return APP_LOCALES.some((locale) => locale === value)
}

function matchSupportedLocale(value: string): AppLocale | undefined {
  let canonicalLocale: string

  try {
    ;[canonicalLocale] = Intl.getCanonicalLocales(value)
  } catch {
    return undefined
  }

  if (!canonicalLocale) {
    return undefined
  }

  const exactMatch = APP_LOCALES.find(
    (locale) => locale.toLowerCase() === canonicalLocale.toLowerCase(),
  )

  if (exactMatch) {
    return exactMatch
  }

  const language = canonicalLocale.split('-')[0]?.toLowerCase()

  if (language === 'zh') {
    return 'zh-CN'
  }

  if (language === 'en') {
    return 'en'
  }

  return undefined
}

function getBrowserAppLocale(): AppLocale | undefined {
  if (typeof navigator === 'undefined') {
    return undefined
  }

  const preferredLocales =
    navigator.languages.length > 0 ? navigator.languages : [navigator.language]

  for (const locale of preferredLocales) {
    const matchedLocale = matchSupportedLocale(locale)

    if (matchedLocale) {
      return matchedLocale
    }
  }

  return undefined
}

export function getInitialAppLocale(): AppLocale {
  try {
    const savedLocale = window.localStorage.getItem(localeStorageKey)

    if (isAppLocale(savedLocale)) {
      return savedLocale
    }
  } catch {
    // Continue with browser locale detection when storage is unavailable.
  }

  return getBrowserAppLocale() ?? 'en'
}

export function persistAppLocale(locale: AppLocale): void {
  try {
    window.localStorage.setItem(localeStorageKey, locale)
  } catch {
    // The language still applies for the current session when storage is unavailable.
  }
}

const initialLocale = getInitialAppLocale()
const numberFormats = {
  'zh-CN': {
    byte: {
      style: 'unit',
      unit: 'byte',
      unitDisplay: 'narrow',
      maximumFractionDigits: 0,
    },
    kilobyte: {
      style: 'unit',
      unit: 'kilobyte',
      unitDisplay: 'narrow',
      maximumFractionDigits: 1,
    },
    millisecond: {
      style: 'unit',
      unit: 'millisecond',
      unitDisplay: 'narrow',
      maximumFractionDigits: 0,
    },
    second: {
      style: 'unit',
      unit: 'second',
      unitDisplay: 'narrow',
      maximumFractionDigits: 1,
    },
  },
  en: {
    byte: {
      style: 'unit',
      unit: 'byte',
      unitDisplay: 'narrow',
      maximumFractionDigits: 0,
    },
    kilobyte: {
      style: 'unit',
      unit: 'kilobyte',
      unitDisplay: 'narrow',
      maximumFractionDigits: 1,
    },
    millisecond: {
      style: 'unit',
      unit: 'millisecond',
      unitDisplay: 'narrow',
      maximumFractionDigits: 0,
    },
    second: {
      style: 'unit',
      unit: 'second',
      unitDisplay: 'narrow',
      maximumFractionDigits: 1,
    },
  },
} as const

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages: {
    'zh-CN': zhCN,
    en,
  },
  numberFormats,
})

if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLocale
}
