const textMimeTypes = new Set([
  'application/javascript',
  'application/json',
  'application/typescript',
  'application/xml',
  'image/svg+xml',
  'model/gltf+json',
])

const textExtensions = new Set([
  'cjs',
  'csv',
  'css',
  'env',
  'gltf',
  'htm',
  'html',
  'js',
  'json',
  'jsx',
  'md',
  'mjs',
  'svg',
  'toml',
  'ts',
  'tsx',
  'txt',
  'vue',
  'xml',
  'yaml',
  'yml',
])

const binaryExtensions = new Set([
  '7z',
  'bz2',
  'dmg',
  'doc',
  'docx',
  'eot',
  'exe',
  'gz',
  'otf',
  'pdf',
  'ppt',
  'pptx',
  'rar',
  'tar',
  'ttf',
  'wasm',
  'woff',
  'woff2',
  'xls',
  'xlsx',
  'zip',
])

const mimeTypes: Record<string, string> = {
  aac: 'audio/aac',
  apng: 'image/apng',
  avif: 'image/avif',
  bmp: 'image/bmp',
  css: 'text/css',
  csv: 'text/csv',
  eot: 'application/vnd.ms-fontobject',
  flac: 'audio/flac',
  gif: 'image/gif',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  htm: 'text/html',
  html: 'text/html',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript',
  json: 'application/json',
  m4a: 'audio/mp4',
  m4v: 'video/mp4',
  md: 'text/markdown',
  mjs: 'text/javascript',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  ogv: 'video/ogg',
  otf: 'font/otf',
  pdf: 'application/pdf',
  png: 'image/png',
  svg: 'image/svg+xml',
  toml: 'application/toml',
  ts: 'text/typescript',
  ttf: 'font/ttf',
  txt: 'text/plain',
  vue: 'text/plain',
  wasm: 'application/wasm',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
}

export function extensionForPath(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? ''
}

export function isTextFile(path: string, mimeType = ''): boolean {
  const normalizedMimeType = mimeType.toLowerCase()

  return (
    normalizedMimeType.startsWith('text/') ||
    textMimeTypes.has(normalizedMimeType) ||
    textExtensions.has(extensionForPath(path))
  )
}

export function isKnownBinaryFile(path: string): boolean {
  const extension = extensionForPath(path)

  return (
    binaryExtensions.has(extension) ||
    (mimeTypes[extension] !== undefined && !textExtensions.has(extension))
  )
}

export function mimeTypeForPath(path: string, fallback = 'application/octet-stream'): string {
  return mimeTypes[extensionForPath(path)] ?? fallback
}
