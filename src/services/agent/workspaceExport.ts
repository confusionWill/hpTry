import JSZip from 'jszip'

import { loadWorkspaceAsset } from '@/services/agent/workspaceFiles'
import type { Project, WorkspaceFile } from '@/types/agent'
import { isKnownBinaryFile, isTextFile, mimeTypeForPath } from '@/utils/fileType'

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

function fileNameFromProject(value: string): string {
  const fileName = value
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/[. ]+$/g, '')

  return `${fileName || 'hpTry project'}.hp`
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
  const zip = new JSZip()

  const exportFiles = files.filter((file) => !file.path.startsWith('.tmp/'))

  for (const file of exportFiles.slice().sort((a, b) => a.path.localeCompare(b.path))) {
    if (file.kind === 'asset') {
      const asset = await loadWorkspaceAsset(file)

      if (asset) {
        zip.file(file.path, asset.blob)
      }

      continue
    }

    zip.file(file.path, file.content)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, fileNameFromProject(project.name))
}

function nameFromArchive(fileName: string): string {
  return fileName.replace(/\.hp$/i, '').trim() || 'hpTry project'
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

  const importedFiles: ImportedWorkspaceFile[] = []

  for (const entry of archiveEntries) {
    const path = entry.name

    const bytes = await entry.async('uint8array')
    const kind =
      (isTextFile(path) || (!isKnownBinaryFile(path) && !isBinaryContent(bytes)) ? 'text' : 'asset')

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
