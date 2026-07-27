const PROTOCOL_VERSION = 2
const PREVIEW_PREFIX = '/preview/'
const PREVIEW_BRIDGE_TAG = '<script src="/preview-bridge.js"></script>'
const REQUEST_TIMEOUT_MS = 10_000

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (!url.pathname.startsWith(PREVIEW_PREFIX)) {
    return
  }

  event.respondWith(handlePreviewRequest(event.request, url))
})

async function handlePreviewRequest(request, url) {
  const previewPath = parsePreviewPath(url.pathname)

  if (!previewPath) {
    return notFoundResponse()
  }

  const response = await requestPreviewResource(previewPath)

  if (response.status !== 200) {
    return errorResponse(response.status, response.message)
  }

  return fileResponse(response.resource, request, previewPath)
}

function parsePreviewPath(pathname) {
  const rawPath = pathname.slice(PREVIEW_PREFIX.length)
  const parts = rawPath.split('/').filter(Boolean)
  const session = parts.shift()
  const projectId = parts.shift()
  const version = parts.shift()

  if (!session || !projectId || !version) {
    return null
  }

  try {
    return {
      session: decodeURIComponent(session),
      projectId: decodeURIComponent(projectId),
      version: decodeURIComponent(version),
      filePath: normalizePath(parts.map(decodeURIComponent).join('/') || 'hp.html'),
    }
  } catch {
    return null
  }
}

async function requestPreviewResource(previewPath) {
  const host = await findPreviewHost(previewPath.session)

  if (!host) {
    return unavailableFileResponse('Preview host is unavailable')
  }

  const requestId = crypto.randomUUID()
  const channel = new MessageChannel()

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      channel.port1.close()
      resolve(unavailableFileResponse('Preview request timed out', requestId))
    }, REQUEST_TIMEOUT_MS)

    channel.port1.onmessage = (event) => {
      if (!isPreviewFileResponse(event.data, requestId)) {
        return
      }

      clearTimeout(timeout)
      channel.port1.close()
      resolve(event.data)
    }
    channel.port1.onmessageerror = () => {
      clearTimeout(timeout)
      channel.port1.close()
      resolve(unavailableFileResponse('Preview response is invalid', requestId))
    }
    channel.port1.start()

    try {
      host.postMessage(
        {
          protocol: PROTOCOL_VERSION,
          type: 'preview:file-request',
          requestId,
          session: previewPath.session,
          projectId: previewPath.projectId,
          version: previewPath.version,
          path: previewPath.filePath,
        },
        [channel.port2],
      )
    } catch {
      clearTimeout(timeout)
      channel.port1.close()
      resolve(unavailableFileResponse('Unable to contact preview host', requestId))
    }
  })
}

async function findPreviewHost(session) {
  const windowClients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  const candidates = windowClients
    .map((client) => ({ client, url: new URL(client.url) }))
    .filter(
      ({ url }) =>
        url.pathname === '/' &&
        url.searchParams.get('session') === session &&
        Number.isInteger(Number.parseInt(url.searchParams.get('attempt') ?? '', 10)),
    )
    .sort(
      (left, right) =>
        Number.parseInt(right.url.searchParams.get('attempt') ?? '0', 10) -
        Number.parseInt(left.url.searchParams.get('attempt') ?? '0', 10),
    )

  return candidates[0]?.client ?? null
}

async function fileResponse(resource, request, previewPath) {
  const headers = baseHeaders(resource.path, resource.mimeType)
  const body = await bodyForResource(resource, previewPath)

  if (body instanceof Blob) {
    const range = request.headers.get('Range')

    if (range) {
      return blobRangeResponse(body, range, headers)
    }
  }

  if (body instanceof Uint8Array) {
    const range = request.headers.get('Range')

    if (range) {
      return bytesRangeResponse(body, range, headers)
    }
  }

  return new Response(body, {
    status: 200,
    headers,
  })
}

async function bodyForResource(resource, previewPath) {
  if (resource.kind === 'asset') {
    return resource.blob
  }

  const content = resource.content ?? ''
  const trimmedContent = typeof content === 'string' ? content.trim() : ''
  const base64Content = typeof content === 'string' ? content.replace(/\s/g, '') : ''

  if (trimmedContent.startsWith('data:')) {
    return dataUrlToBytes(trimmedContent)
  }

  if (isBinaryPath(resource.path) && isBase64Content(base64Content)) {
    return base64ToBytes(base64Content)
  }

  if (typeof content === 'string') {
    return isPreviewEntry(previewPath.filePath) ? injectPreviewBridge(content) : content
  }

  return content
}

function isPreviewFileResponse(value, requestId) {
  if (!isRecord(value)) {
    return false
  }

  if (
    value.protocol !== PROTOCOL_VERSION ||
    value.type !== 'preview:file-response' ||
    value.requestId !== requestId
  ) {
    return false
  }

  if (value.status === 200) {
    return (
      isRecord(value.resource) &&
      typeof value.resource.path === 'string' &&
      ((value.resource.kind === 'text' && typeof value.resource.content === 'string') ||
        (value.resource.kind === 'asset' && value.resource.blob instanceof Blob))
    )
  }

  return (
    (value.status === 404 || value.status === 409 || value.status === 503) &&
    typeof value.message === 'string'
  )
}

function unavailableFileResponse(message, requestId = '') {
  return {
    protocol: PROTOCOL_VERSION,
    type: 'preview:file-response',
    requestId,
    status: 503,
    message,
  }
}

function isPreviewEntry(path) {
  return path.split('/').pop() === 'hp.html'
}

function injectPreviewBridge(content) {
  if (
    /<script\b[^>]*\bsrc=(["'])\/preview-bridge\.js\1[^>]*>\s*<\/script>/i.test(content)
  ) {
    return content
  }

  const headEnd = content.search(/<\/head\s*>/i)

  if (headEnd >= 0) {
    return `${content.slice(0, headEnd)}${PREVIEW_BRIDGE_TAG}\n${content.slice(headEnd)}`
  }

  return `${PREVIEW_BRIDGE_TAG}\n${content}`
}

function baseHeaders(path, mimeType) {
  return {
    'Content-Type': mimeType || mimeTypeForPath(path),
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
}

function parseRange(range, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())

  if (!match) {
    return null
  }

  const startValue = match[1]
  const endValue = match[2]

  if (!startValue && !endValue) {
    return null
  }

  let start
  let end

  if (!startValue) {
    const suffixLength = Number(endValue)

    if (Number.isNaN(suffixLength) || suffixLength <= 0 || size === 0) {
      return { ok: false }
    }

    start = Math.max(size - suffixLength, 0)
    end = size - 1
  } else {
    start = Number(startValue)
    end = endValue ? Number(endValue) : size - 1

    if (Number.isNaN(start) || Number.isNaN(end) || size === 0 || start >= size || start > end) {
      return { ok: false }
    }

    end = Math.min(end, size - 1)
  }

  return { ok: true, start, end }
}

function bytesRangeResponse(bytes, range, headers) {
  const parsedRange = parseRange(range, bytes.byteLength)

  if (!parsedRange) {
    return new Response(bytes, {
      status: 200,
      headers,
    })
  }

  if (!parsedRange.ok) {
    return unsatisfiableRangeResponse(bytes.byteLength, headers)
  }

  const { start, end } = parsedRange

  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${bytes.byteLength}`,
    },
  })
}

function blobRangeResponse(blob, range, headers) {
  const parsedRange = parseRange(range, blob.size)

  if (!parsedRange) {
    return new Response(blob, {
      status: 200,
      headers,
    })
  }

  if (!parsedRange.ok) {
    return unsatisfiableRangeResponse(blob.size, headers)
  }

  const { start, end } = parsedRange

  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${blob.size}`,
    },
  })
}

function unsatisfiableRangeResponse(size, headers) {
  return new Response(null, {
    status: 416,
    headers: {
      ...headers,
      'Content-Range': `bytes */${size}`,
    },
  })
}

function normalizePath(path) {
  const parts = []

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

function dataUrlToBytes(dataUrl) {
  const commaIndex = dataUrl.indexOf(',')

  if (commaIndex < 0) {
    return new Uint8Array()
  }

  const meta = dataUrl.slice(0, commaIndex)
  const value = dataUrl.slice(commaIndex + 1)

  if (meta.endsWith(';base64')) {
    return base64ToBytes(value)
  }

  return new TextEncoder().encode(decodeURIComponent(value))
}

function base64ToBytes(content) {
  const binary = atob(content)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function isBase64Content(content) {
  return Boolean(content) && /^[A-Za-z0-9+/=]+$/.test(content) && content.length % 4 === 0
}

function isBinaryPath(path) {
  const extension = extensionForPath(path)

  return binaryExtensions.has(extension)
}

function mimeTypeForPath(path) {
  const extension = extensionForPath(path)

  return mimeTypes[extension] ?? 'application/octet-stream'
}

function extensionForPath(path) {
  return path.split('.').pop()?.toLowerCase() ?? ''
}

const binaryExtensions = new Set([
  'apng',
  'avif',
  'gif',
  'jpeg',
  'jpg',
  'm4v',
  'mov',
  'mp3',
  'mp4',
  'ogg',
  'ogv',
  'otf',
  'png',
  'ttf',
  'wav',
  'webm',
  'webp',
  'woff',
  'woff2',
])

const mimeTypes = {
  apng: 'image/apng',
  avif: 'image/avif',
  css: 'text/css; charset=utf-8',
  gif: 'image/gif',
  html: 'text/html; charset=utf-8',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  m4v: 'video/mp4',
  map: 'application/json; charset=utf-8',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  ogg: 'audio/ogg',
  ogv: 'video/ogg',
  otf: 'font/otf',
  png: 'image/png',
  svg: 'image/svg+xml; charset=utf-8',
  text: 'text/plain; charset=utf-8',
  ts: 'text/typescript; charset=utf-8',
  ttf: 'font/ttf',
  txt: 'text/plain; charset=utf-8',
  wasm: 'application/wasm',
  wav: 'audio/wav',
  webm: 'video/webm',
  webmanifest: 'application/manifest+json; charset=utf-8',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  xml: 'application/xml; charset=utf-8',
}

function notFoundResponse() {
  return new Response('Not found', {
    status: 404,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function errorResponse(status, message) {
  return new Response(message, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function isRecord(value) {
  return typeof value === 'object' && value !== null
}
