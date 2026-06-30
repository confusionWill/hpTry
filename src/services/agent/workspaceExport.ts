import JSZip from 'jszip'

import type { Project, WorkspaceFile } from '@/types/agent'

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'hpWill-project'
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

export async function exportWorkspaceAsZip(project: Project, files: WorkspaceFile[]): Promise<void> {
  const rootName = slugify(project.name)
  const zip = new JSZip()
  const root = zip.folder(rootName)

  if (!root) {
    throw new Error('Failed to create ZIP folder')
  }

  files
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .forEach((file) => {
      root.file(file.path, file.content)
    })

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, `${rootName}.zip`)
}
