import type { ComposerNumberFormatting } from 'vue-i18n'

export function formatBytes(
  bytes: number,
  formatNumber: ComposerNumberFormatting,
): string {
  if (bytes < 1024) {
    return formatNumber(bytes, 'byte')
  }

  return formatNumber(bytes / 1024, 'kilobyte')
}

export function formatDuration(
  durationMs: number,
  formatNumber: ComposerNumberFormatting,
): string {
  if (durationMs < 1000) {
    return formatNumber(durationMs, 'millisecond')
  }

  return formatNumber(durationMs / 1000, 'second')
}
