export type PreviewErrorKind = 'runtime' | 'unhandled-rejection' | 'console' | 'resource'

export interface PreviewRuntimeError {
  kind: PreviewErrorKind
  message: string
  source?: string
  line?: number
  column?: number
  stack?: string
  timestamp: number
}

export interface PreviewErrorSnapshot {
  projectId: string
  version: string
  errors: PreviewRuntimeError[]
}

export interface PreviewErrorValidationRequest {
  projectId: string
  version: string
  signal?: AbortSignal
}

type PreviewErrorValidator = (
  request: PreviewErrorValidationRequest,
) => Promise<PreviewErrorSnapshot | undefined>

const MAX_PREVIEW_ERRORS = 100
const snapshots = new Map<string, PreviewErrorSnapshot>()
let previewErrorValidator: PreviewErrorValidator | undefined

export function resetPreviewErrors(projectId: string, version: string) {
  snapshots.set(projectId, { projectId, version, errors: [] })
}

export function recordPreviewError(
  projectId: string,
  version: string,
  error: PreviewRuntimeError,
) {
  const current = snapshots.get(projectId)
  const snapshot =
    current?.version === version
      ? current
      : { projectId, version, errors: [] }

  snapshot.errors.push(error)

  if (snapshot.errors.length > MAX_PREVIEW_ERRORS) {
    snapshot.errors.splice(0, snapshot.errors.length - MAX_PREVIEW_ERRORS)
  }

  snapshots.set(projectId, snapshot)
}

export function getPreviewErrorSnapshot(projectId: string): PreviewErrorSnapshot | undefined {
  const snapshot = snapshots.get(projectId)

  if (!snapshot) {
    return undefined
  }

  return {
    ...snapshot,
    errors: snapshot.errors.map((error) => ({ ...error })),
  }
}

export function registerPreviewErrorValidator(validator: PreviewErrorValidator): () => void {
  previewErrorValidator = validator

  return () => {
    if (previewErrorValidator === validator) {
      previewErrorValidator = undefined
    }
  }
}

export async function validatePreviewErrors(
  request: PreviewErrorValidationRequest,
): Promise<PreviewErrorSnapshot | undefined> {
  return previewErrorValidator?.(request)
}

export function clearPreviewErrors(projectId: string) {
  snapshots.delete(projectId)
}
