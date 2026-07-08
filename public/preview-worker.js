const DB_NAME = 'hpTry'
const PREVIEW_PREFIX = '/preview/'

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

  const file = await readWorkspaceFile(previewPath.projectId, previewPath.filePath)

  if (!file) {
    return notFoundResponse()
  }

  const asset = file.kind === 'asset' && file.assetId ? await readWorkspaceAsset(file.assetId) : null

  if (file.kind === 'asset' && !asset) {
    return notFoundResponse()
  }

  return fileResponse(file, asset, request, previewPath)
}

function parsePreviewPath(pathname) {
  const rawPath = pathname.slice(PREVIEW_PREFIX.length)
  const parts = rawPath.split('/').filter(Boolean)
  const projectId = parts.shift()

  if (!projectId) {
    return null
  }

  return {
    projectId: decodeURIComponent(projectId),
    filePath: normalizePath(parts.map(decodeURIComponent).join('/') || 'hp.html'),
  }
}

async function readWorkspaceFile(projectId, filePath) {
  const db = await openDatabase()
  const transaction = db.transaction('workspaceFiles', 'readonly')
  const store = transaction.objectStore('workspaceFiles')
  const index = store.index('projectPath')

  return requestResult(index.get([projectId, filePath]))
}

async function readWorkspaceAsset(assetId) {
  const db = await openDatabase()
  const transaction = db.transaction('workspaceAssets', 'readonly')
  const store = transaction.objectStore('workspaceAssets')

  return requestResult(store.get(assetId))
}

async function fileResponse(file, asset, request, previewPath) {
  const headers = baseHeaders(file.path, file.mimeType)
  const body = await bodyForFile(file, asset, previewPath)

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

async function bodyForFile(file, asset, previewPath) {
  if (asset?.blob) {
    return asset.blob
  }

  const content = file.content ?? ''
  const trimmedContent = typeof content === 'string' ? content.trim() : ''
  const base64Content = typeof content === 'string' ? content.replace(/\s/g, '') : ''

  if (trimmedContent.startsWith('data:')) {
    return dataUrlToBytes(trimmedContent)
  }

  if (isBinaryPath(file.path) && isBase64Content(base64Content)) {
    return base64ToBytes(base64Content)
  }

  if (typeof content === 'string') {
    return rewritePreviewText(content, previewPath)
  }

  return content
}

function rewritePreviewText(content, previewPath) {
  const extension = extensionForPath(previewPath.filePath)
  const previewRoot = `${PREVIEW_PREFIX}${encodeURIComponent(previewPath.projectId)}/`

  if (extension === 'html' || extension === 'htm') {
    return rewriteHtmlRootUrls(content, previewRoot)
  }

  if (extension === 'css') {
    return rewriteCssRootUrls(content, previewRoot)
  }

  return content
}

function rewriteHtmlRootUrls(content, previewRoot) {
  return content
    .replace(
      /\b(src|href|action|poster)=("|')\/(?!\/)([^"']*)\2/gi,
      (_match, attribute, quote, rawPath) =>
        `${attribute}=${quote}${previewRoot}${rawPath}${quote}`,
    )
    .replace(/\bsrcset=("|')([^"']*)\1/gi, (_match, quote, value) => {
      const rewrittenValue = value
        .split(',')
        .map((entry) => {
          const trimmedEntry = entry.trim()

          if (!trimmedEntry.startsWith('/')) {
            return entry
          }

          return entry.replace('/' + trimmedEntry.slice(1), `${previewRoot}${trimmedEntry.slice(1)}`)
        })
        .join(',')

      return `srcset=${quote}${rewrittenValue}${quote}`
    })
}

function rewriteCssRootUrls(content, previewRoot) {
  return content
    .replace(
      /url\((["']?)\/(?!\/)([^"')]+)\1\)/gi,
      (_match, quote, rawPath) => `url(${quote}${previewRoot}${rawPath}${quote})`,
    )
    .replace(
      /@import\s+(["'])\/(?!\/)([^"']+)\1/gi,
      (_match, quote, rawPath) => `@import ${quote}${previewRoot}${rawPath}${quote}`,
    )
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

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
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
