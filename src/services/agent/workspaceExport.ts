import JSZip from 'jszip'

import { loadWorkspaceAsset } from '@/services/agent/workspaceFiles'
import type { Project, WorkspaceFile } from '@/types/agent'

export interface ImportedWorkspaceFile {
  path: string
  kind: 'text' | 'asset'
  content?: string
  blob?: Blob
  name?: string
  mimeType?: string
}

export interface ImportedWorkspace {
  name: string
  files: ImportedWorkspaceFile[]
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'hpTry-project'
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function exportWorkspaceAsHp(project: Project, files: WorkspaceFile[]): Promise<void> {
  const rootName = slugify(project.name)
  const zip = new JSZip()
  const root = zip.folder(rootName)

  if (!root) {
    throw new Error('Failed to create ZIP folder')
  }

  const exportFiles = files.filter((file) => !file.path.startsWith('.tmp/'))

  for (const file of exportFiles.slice().sort((a, b) => a.path.localeCompare(b.path))) {
    if (file.kind === 'asset') {
      const asset = await loadWorkspaceAsset(file)

      if (asset) {
        root.file(file.path, asset.blob)
      }

      continue
    }

    root.file(file.path, file.content)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, `${rootName}.hp`)
}

function nameFromArchive(fileName: string): string {
  return fileName.replace(/\.hp$/i, '').trim() || 'hpTry project'
}

function mimeTypeForPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    avif: 'image/avif',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    pdf: 'application/pdf',
    png: 'image/png',
    webm: 'video/webm',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
  }

  return (extension && mimeTypes[extension]) || 'application/octet-stream'
}

function isBinaryContent(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) {
    return true
  }

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return false
  } catch {
    return true
  }
}

export async function importWorkspaceFromHp(file: File): Promise<ImportedWorkspace> {
  const zip = await JSZip.loadAsync(file)
  const archiveEntries = Object.values(zip.files).filter((entry) => !entry.dir)
  if (archiveEntries.length === 0) {
    throw new Error('HP project contains no files')
  }

  const roots = new Set(archiveEntries.map((entry) => entry.name.split('/')[0]))
  const sharedRoot =
    roots.size === 1 && archiveEntries.every((entry) => entry.name.includes('/'))
      ? [...roots][0]
      : ''
  const importedFiles: ImportedWorkspaceFile[] = []

  for (const entry of archiveEntries) {
    const path =
      sharedRoot && entry.name.startsWith(`${sharedRoot}/`)
        ? entry.name.slice(sharedRoot.length + 1)
        : entry.name

    if (!path) {
      continue
    }

    const bytes = await entry.async('uint8array')
    const kind = isBinaryContent(bytes) ? 'asset' : 'text'

    if (kind === 'asset') {
      const mimeType = mimeTypeForPath(path)
      importedFiles.push({
        path,
        kind,
        blob: new Blob([bytes], { type: mimeType }),
        name: path.split('/').pop() || path,
        mimeType,
      })
      continue
    }

    importedFiles.push({
      path,
      kind,
      content: new TextDecoder().decode(bytes),
    })
  }

  return {
    name: nameFromArchive(file.name),
    files: importedFiles,
  }
}
