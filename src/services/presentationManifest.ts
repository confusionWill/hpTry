export interface PresentationSize {
  width: number
  height: number
}

export const DEFAULT_PRESENTATION_SIZE: PresentationSize = {
  width: 1920,
  height: 1080,
}

export interface PresentationManifest {
  size: PresentationSize
  slides: string[]
}

export function parsePresentationManifest(content: string): PresentationManifest | null {
  try {
    const value = JSON.parse(content) as unknown

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null
    }

    const manifest = value as Record<string, unknown>

    if (
      !Array.isArray(manifest.slides) ||
      manifest.slides.length === 0 ||
      !manifest.slides.every(
        (slide): slide is string => typeof slide === 'string' && slide.length > 0,
      )
    ) {
      return null
    }

    return {
      size: isPresentationSize(manifest.size)
        ? { ...manifest.size }
        : { ...DEFAULT_PRESENTATION_SIZE },
      slides: [...manifest.slides],
    }
  } catch {
    return null
  }
}

function isPresentationSize(value: unknown): value is PresentationSize {
  if (!value || typeof value !== 'object') {
    return false
  }

  const size = value as Partial<PresentationSize>

  return (
    typeof size.width === 'number' &&
    Number.isFinite(size.width) &&
    size.width > 0 &&
    typeof size.height === 'number' &&
    Number.isFinite(size.height) &&
    size.height > 0
  )
}
