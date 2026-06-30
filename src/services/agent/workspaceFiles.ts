import { languageForPath, normalizeWorkspacePath } from '@/services/agent/tools'
import { deleteRecord, getRecordsByIndex, putRecord } from '@/services/db'
import type { WorkspaceFile } from '@/types/agent'
import { createId, now } from '@/utils/records'

export function sortWorkspaceFiles(files: WorkspaceFile[]): WorkspaceFile[] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path))
}

export async function loadProjectWorkspaceFiles(projectId: string): Promise<WorkspaceFile[]> {
  return sortWorkspaceFiles(await getRecordsByIndex('workspaceFiles', 'projectId', projectId))
}

export async function upsertProjectWorkspaceFile(
  projectId: string,
  files: WorkspaceFile[],
  path: string,
  content: string,
): Promise<WorkspaceFile> {
  const normalizedPath = normalizeWorkspacePath(path)
  const timestamp = now()
  const existing =
    files.find((file) => file.path === normalizedPath) ??
    (await getRecordsByIndex('workspaceFiles', 'projectPath', [projectId, normalizedPath]))[0]
  const file: WorkspaceFile = {
    id: existing?.id ?? createId('file'),
    projectId,
    path: normalizedPath,
    content,
    language: languageForPath(normalizedPath),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }

  await putRecord('workspaceFiles', file)
  const nextFiles = sortWorkspaceFiles([...files.filter((item) => item.id !== file.id), file])
  files.splice(0, files.length, ...nextFiles)

  return file
}

export async function deleteProjectWorkspaceFile(
  projectId: string,
  files: WorkspaceFile[],
  path: string,
): Promise<WorkspaceFile[]> {
  const normalizedPath = normalizeWorkspacePath(path)
  const existing =
    files.find((file) => file.path === normalizedPath) ??
    (await getRecordsByIndex('workspaceFiles', 'projectPath', [projectId, normalizedPath]))[0]

  if (!existing) {
    throw new Error(`File not found: ${normalizedPath}`)
  }

  await deleteRecord('workspaceFiles', existing.id)
  const nextFiles = files.filter((file) => file.id !== existing.id)
  files.splice(0, files.length, ...nextFiles)

  return nextFiles
}

export async function renameProjectWorkspaceFile(
  projectId: string,
  files: WorkspaceFile[],
  fromPath: string,
  toPath: string,
): Promise<WorkspaceFile> {
  const normalizedFromPath = normalizeWorkspacePath(fromPath)
  const normalizedToPath = normalizeWorkspacePath(toPath)
  const existing =
    files.find((file) => file.path === normalizedFromPath) ??
    (await getRecordsByIndex('workspaceFiles', 'projectPath', [projectId, normalizedFromPath]))[0]

  if (!existing) {
    throw new Error(`File not found: ${normalizedFromPath}`)
  }

  const replaced =
    files.find((file) => file.path === normalizedToPath) ??
    (await getRecordsByIndex('workspaceFiles', 'projectPath', [projectId, normalizedToPath]))[0]

  if (replaced && replaced.id !== existing.id) {
    await deleteRecord('workspaceFiles', replaced.id)
  }

  const file: WorkspaceFile = {
    ...existing,
    path: normalizedToPath,
    language: languageForPath(normalizedToPath),
    updatedAt: now(),
  }

  await putRecord('workspaceFiles', file)
  const nextFiles = sortWorkspaceFiles([
    ...files.filter((item) => item.id !== file.id && item.id !== replaced?.id),
    file,
  ])
  files.splice(0, files.length, ...nextFiles)

  return file
}
