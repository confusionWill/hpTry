import JSZip from 'jszip'

import { loadWorkspaceAsset } from '@/services/agent/workspaceFiles'
import type { Project, WorkspaceFile } from '@/types/agent'
import { isKnownBinaryFile, isTextFile, mimeTypeForPath } from '@/utils/fileType'

const MANIFEST_PATH = '.hp-project.json'

interface HpProjectManifestFile {
  path: string
  kind: 'text' | 'asset'
  name?: string
  mimeType?: string
}

interface HpProjectManifest {
  format: 'hp-project'
  version: 1
  name: string
  root: string
  files: HpProjectManifestFile[]
}

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
  const manifest: HpProjectManifest = {
    format: 'hp-project',
    version: 1,
    name: project.name,
    root: rootName,
    files: exportFiles.map((file) => ({
      path: file.path,
      kind: file.kind === 'asset' ? 'asset' : 'text',
      name: file.name,
      mimeType: file.mimeType,
    })),
  }

  zip.file(MANIFEST_PATH, JSON.stringify(manifest))

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

function isManifestFile(value: unknown): value is HpProjectManifestFile {
  if (!value || typeof value !== 'object') {
    return false
  }

  const file = value as Partial<HpProjectManifestFile>
  return (
    typeof file.path === 'string' &&
    (file.kind === 'text' || file.kind === 'asset') &&
    (file.name === undefined || typeof file.name === 'string') &&
    (file.mimeType === undefined || typeof file.mimeType === 'string')
  )
}

function isHpProjectManifest(value: unknown): value is HpProjectManifest {
  if (!value || typeof value !== 'object') {
    return false
  }

  const manifest = value as Partial<HpProjectManifest>
  return (
    manifest.format === 'hp-project' &&
    manifest.version === 1 &&
    typeof manifest.name === 'string' &&
    typeof manifest.root === 'string' &&
    Array.isArray(manifest.files) &&
    manifest.files.every(isManifestFile)
  )
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
  const manifestEntry = zip.file(MANIFEST_PATH)
  let manifest: HpProjectManifest | undefined

  if (manifestEntry) {
    const parsed: unknown = JSON.parse(await manifestEntry.async('string'))
    if (!isHpProjectManifest(parsed)) {
      throw new Error('Invalid HP project manifest')
    }
    manifest = parsed
  }

  const archiveEntries = Object.values(zip.files).filter(
    (entry) => !entry.dir && entry.name !== MANIFEST_PATH,
  )
  if (archiveEntries.length === 0) {
    throw new Error('HP project contains no files')
  }

  const roots = new Set(archiveEntries.map((entry) => entry.name.split('/')[0]))
  const sharedRoot =
    manifest?.root ||
    (roots.size === 1 && archiveEntries.every((entry) => entry.name.includes('/'))
      ? [...roots][0]
      : '')
  const metadata = new Map(manifest?.files.map((entry) => [entry.path, entry]) ?? [])
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
    const fileMetadata = metadata.get(path)
    const kind =
      fileMetadata?.kind ??
      (isTextFile(path) || (!isKnownBinaryFile(path) && !isBinaryContent(bytes)) ? 'text' : 'asset')

    if (kind === 'asset') {
      const mimeType = fileMetadata?.mimeType || mimeTypeForPath(path)
      importedFiles.push({
        path,
        kind,
        blob: new Blob([bytes], { type: mimeType }),
        name: fileMetadata?.name || path.split('/').pop() || path,
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
    name: manifest?.name.trim() || nameFromArchive(file.name),
    files: importedFiles,
  }
}
