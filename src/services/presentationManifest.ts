export interface PresentationKeyboardNavigation {
  enabled: boolean
  prev: string[]
  next: string[]
}

export interface PresentationManifest {
  version: number
  name: string
  entry: string
  aspectRatio: string
  navigation: {
    keyboard: PresentationKeyboardNavigation
  }
  slides: string[]
}

export function parsePresentationManifest(content: string): PresentationManifest | null {
  try {
    const value = JSON.parse(content) as Partial<PresentationManifest>

    if (
      typeof value.version !== 'number' ||
      typeof value.name !== 'string' ||
      typeof value.entry !== 'string' ||
      typeof value.aspectRatio !== 'string' ||
      !Array.isArray(value.slides) ||
      value.slides.length === 0 ||
      !value.slides.every((slide) => typeof slide === 'string' && slide.length > 0)
    ) {
      return null
    }

    const keyboard = value.navigation?.keyboard

    return {
      version: value.version,
      name: value.name,
      entry: value.entry,
      aspectRatio: value.aspectRatio,
      navigation: {
        keyboard: {
          enabled: keyboard?.enabled !== false,
          prev: normalizeKeys(keyboard?.prev, ['ArrowLeft']),
          next: normalizeKeys(keyboard?.next, ['ArrowRight']),
        },
      },
      slides: [...value.slides],
    }
  } catch {
    return null
  }
}

function normalizeKeys(keys: string[] | undefined, fallback: string[]): string[] {
  return Array.isArray(keys) && keys.every((key) => typeof key === 'string') ? keys : fallback
}
