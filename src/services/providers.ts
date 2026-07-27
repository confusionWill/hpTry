import type { Provider } from '@/types/agent'

export const DEFAULT_PROVIDER_ID = 'provider-deepseek-default'
export const DEFAULT_PROVIDER_NAME = 'DeepSeek'
export const DEFAULT_PROVIDER_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_PROVIDER_MODEL = 'deepseek-v4-flash'

export function createDefaultProvider(apiKey = '', timestamp = Date.now()): Provider {
  return {
    id: DEFAULT_PROVIDER_ID,
    name: DEFAULT_PROVIDER_NAME,
    baseUrl: DEFAULT_PROVIDER_BASE_URL,
    apiKey,
    model: DEFAULT_PROVIDER_MODEL,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function isDefaultProvider(provider: Pick<Provider, 'id'>): boolean {
  return provider.id === DEFAULT_PROVIDER_ID
}

export function sortProviders(providers: Provider[]): Provider[] {
  return [...providers].sort((left, right) => {
    const defaultOrder =
      Number(isDefaultProvider(right)) - Number(isDefaultProvider(left))

    return defaultOrder || left.createdAt - right.createdAt
  })
}
