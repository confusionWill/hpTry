import { ref } from 'vue'
import { defineStore } from 'pinia'

import {
  getInitialAppLocale,
  i18n,
  persistAppLocale,
  type AppLocale,
} from '@/locales'

export const useSettingsStore = defineStore('settings', () => {
  const locale = ref<AppLocale>(getInitialAppLocale())

  function setLocale(value: AppLocale): void {
    locale.value = value
    i18n.global.locale.value = value

    if (typeof document !== 'undefined') {
      document.documentElement.lang = value
    }

    persistAppLocale(value)
  }

  return {
    locale,
    setLocale,
  }
})
