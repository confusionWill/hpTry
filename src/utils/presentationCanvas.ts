export interface PreviewCanvasSize {
  width: number
  height: number
}

export type PreviewAspectRatio = '16-9' | '21-9' | '9-16' | '4-3' | '3-4'

export const PREVIEW_CANVAS_SIZE_MAP: Record<PreviewAspectRatio, PreviewCanvasSize> = {
  '16-9': { width: 1920, height: 1080 },
  '21-9': { width: 2560, height: 1080 },
  '9-16': { width: 1080, height: 1920 },
  '4-3': { width: 1440, height: 1080 },
  '3-4': { width: 1080, height: 1440 },
}
