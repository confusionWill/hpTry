import {
  loadProjectWorkspaceFile,
  loadWorkspaceAsset,
} from '@/services/agent/workspaceFiles'

export const PREVIEW_PROTOCOL_VERSION = 2
export const PREVIEW_ORIGIN = configuredPreviewOrigin()

export interface PreviewFileRequest {
  protocol: typeof PREVIEW_PROTOCOL_VERSION
  type: 'preview:file-request'
  requestId: string
  session: string
  projectId: string
  version: string
  path: string
}

export interface PreviewTextResource {
  kind: 'text'
  path: string
  content: string
  mimeType?: string
}

export interface PreviewAssetResource {
  kind: 'asset'
  path: string
  blob: Blob
  mimeType?: string
}

export type PreviewResource = PreviewTextResource | PreviewAssetResource

export type PreviewFileResponse =
  | {
      protocol: typeof PREVIEW_PROTOCOL_VERSION
      type: 'preview:file-response'
      requestId: string
      status: 200
      resource: PreviewResource
    }
  | {
      protocol: typeof PREVIEW_PROTOCOL_VERSION
      type: 'preview:file-response'
      requestId: string
      status: 404 | 409 | 503
      message: string
    }

export interface PreviewChannelMessage {
  protocol: typeof PREVIEW_PROTOCOL_VERSION
  type: 'preview:channel-ready'
  session: string
}

export interface PreviewMessage {
  protocol: typeof PREVIEW_PROTOCOL_VERSION
  type: 'preview:channel-request' | 'preview:error' | 'preview:ready' | 'preview:slide-change'
  session: string
  target?: 'document' | 'host'
  projectId?: string
  version?: string
  page?: number
  message?: string
  attempt?: number
}

export function createPreviewSession(): string {
  return crypto.randomUUID()
}

export function createPreviewHostUrl(session: string, attempt: number): string {
  const url = new URL('/', PREVIEW_ORIGIN)

  url.searchParams.set('session', session)
  url.searchParams.set('parentOrigin', window.location.origin)
  url.searchParams.set('attempt', String(attempt))

  return url.toString()
}

export function createPreviewDocumentUrl(
  projectId: string,
  path: string,
  version: string,
  session: string,
): string {
  const encodedPath = normalizePath(path).split('/').map(encodeURIComponent).join('/')
  const url = new URL(
    [
      '/preview',
      encodeURIComponent(session),
      encodeURIComponent(projectId),
      encodeURIComponent(version),
      encodedPath,
    ].join('/'),
    PREVIEW_ORIGIN,
  )

  url.searchParams.set('v', version)
  url.searchParams.set('__hpSession', session)
  url.searchParams.set('__hpProjectId', projectId)
  url.searchParams.set('__hpParentOrigin', window.location.origin)

  return url.toString()
}

export async function loadPreviewResource(
  projectId: string,
  path: string,
): Promise<PreviewResource | undefined> {
  const normalizedPath = normalizePath(path)

  if (!normalizedPath || normalizedPath.startsWith('.tmp/')) {
    return undefined
  }

  const file = await loadProjectWorkspaceFile(projectId, normalizedPath)

  if (!file || file.projectId !== projectId) {
    return undefined
  }

  if (file.kind === 'asset') {
    const asset = await loadWorkspaceAsset(file)

    if (!asset || asset.projectId !== projectId) {
      return undefined
    }

    return {
      kind: 'asset',
      path: normalizedPath,
      blob: asset.blob,
      mimeType: file.mimeType || asset.mimeType,
    }
  }

  return {
    kind: 'text',
    path: normalizedPath,
    content: file.content,
    mimeType: file.mimeType,
  }
}

export function isPreviewMessage(value: unknown): value is PreviewMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const message = value as Partial<PreviewMessage>

  if (
    message.protocol !== PREVIEW_PROTOCOL_VERSION ||
    typeof message.session !== 'string' ||
    !message.session
  ) {
    return false
  }

  if (message.type === 'preview:channel-request') {
    return (
      message.target === 'host' &&
      Number.isInteger(message.attempt) &&
      Number(message.attempt) >= 0
    )
  }

  if (message.type === 'preview:ready') {
    return (
      message.target === 'document' &&
      typeof message.projectId === 'string' &&
      typeof message.version === 'string'
    )
  }

  if (message.type === 'preview:slide-change') {
    return (
      message.target === 'document' &&
      typeof message.projectId === 'string' &&
      typeof message.version === 'string' &&
      Number.isInteger(message.page) &&
      Number(message.page) >= 1
    )
  }

  if (message.type === 'preview:error') {
    return message.target === 'host' && typeof message.message === 'string'
  }

  return false
}

export function isPreviewChannelMessage(value: unknown): value is PreviewChannelMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const message = value as Partial<PreviewChannelMessage>

  return (
    message.protocol === PREVIEW_PROTOCOL_VERSION &&
    message.type === 'preview:channel-ready' &&
    typeof message.session === 'string' &&
    Boolean(message.session)
  )
}

export function isPreviewFileRequest(value: unknown): value is PreviewFileRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const message = value as Partial<PreviewFileRequest>

  return (
    message.protocol === PREVIEW_PROTOCOL_VERSION &&
    message.type === 'preview:file-request' &&
    typeof message.requestId === 'string' &&
    Boolean(message.requestId) &&
    typeof message.session === 'string' &&
    Boolean(message.session) &&
    typeof message.projectId === 'string' &&
    Boolean(message.projectId) &&
    typeof message.version === 'string' &&
    Boolean(message.version) &&
    typeof message.path === 'string' &&
    Boolean(message.path)
  )
}

function configuredPreviewOrigin(): string {
  const configuredOrigin = import.meta.env.VITE_PREVIEW_ORIGIN?.trim()

  try {
    return new URL(configuredOrigin || 'http://127.0.0.1:5112').origin
  } catch {
    return 'http://127.0.0.1:5112'
  }
}

function normalizePath(path: string): string {
  const parts: string[] = []

  for (const part of path.replace(/^\.?\//, '').split('/')) {
    if (!part || part === '.') {
      continue
    }

    if (part === '..') {
      parts.pop()
      continue
    }

    parts.push(part)
  }

  return parts.join('/')
}
