import { languageForPath, normalizeWorkspacePath } from '@/services/agent/tools'
import { deleteRecord, getAllRecords, getRecord, getRecordsByIndex, putRecord } from '@/services/db'
import type { WorkspaceAsset, WorkspaceFile } from '@/types/agent'
import { createId, now } from '@/utils/records'

export function sortWorkspaceFiles(files: WorkspaceFile[]): WorkspaceFile[] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path))
}

export async function loadProjectWorkspaceFiles(projectId: string): Promise<WorkspaceFile[]> {
  return sortWorkspaceFiles(await getRecordsByIndex('workspaceFiles', 'projectId', projectId))
}

export async function clearTemporaryWorkspaceFiles(): Promise<void> {
  const temporaryFiles = (await getAllRecords('workspaceFiles')).filter((file) =>
    file.path.startsWith('.tmp/'),
  )

  for (const file of temporaryFiles) {
    if (file.assetId) {
      await deleteRecord('workspaceAssets', file.assetId)
    }
    await deleteRecord('workspaceFiles', file.id)
  }
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

  if (existing?.assetId) {
    await deleteRecord('workspaceAssets', existing.assetId)
  }

  const file: WorkspaceFile = {
    id: existing?.id ?? createId('file'),
    projectId,
    path: normalizedPath,
    content,
    language: languageForPath(normalizedPath),
    kind: 'text',
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }

  await putRecord('workspaceFiles', file)
  const nextFiles = sortWorkspaceFiles([...files.filter((item) => item.id !== file.id), file])
  files.splice(0, files.length, ...nextFiles)

  return file
}

export async function upsertProjectWorkspaceAsset(
  projectId: string,
  files: WorkspaceFile[],
  path: string,
  blob: Blob,
  name: string,
  mimeType: string,
): Promise<WorkspaceFile> {
  const normalizedPath = normalizeWorkspacePath(path)
  const timestamp = now()
  const existing =
    files.find((file) => file.path === normalizedPath) ??
    (await getRecordsByIndex('workspaceFiles', 'projectPath', [projectId, normalizedPath]))[0]

  if (existing?.assetId) {
    await deleteRecord('workspaceAssets', existing.assetId)
  }

  const asset: WorkspaceAsset = {
    id: createId('asset'),
    projectId,
    path: normalizedPath,
    name,
    mimeType: mimeType || 'application/octet-stream',
    size: blob.size,
    blob,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
  const file: WorkspaceFile = {
    id: existing?.id ?? createId('file'),
    projectId,
    path: normalizedPath,
    content: '',
    language: languageForPath(normalizedPath),
    kind: 'asset',
    assetId: asset.id,
    name,
    mimeType: asset.mimeType,
    size: asset.size,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }

  await putRecord('workspaceAssets', asset)
  await putRecord('workspaceFiles', file)
  const nextFiles = sortWorkspaceFiles([...files.filter((item) => item.id !== file.id), file])
  files.splice(0, files.length, ...nextFiles)

  return file
}

export async function loadWorkspaceAsset(file: WorkspaceFile): Promise<WorkspaceAsset | undefined> {
  if (!file.assetId) {
    return undefined
  }

  return getRecord('workspaceAssets', file.assetId)
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

  if (existing.assetId) {
    await deleteRecord('workspaceAssets', existing.assetId)
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
    if (replaced.assetId) {
      await deleteRecord('workspaceAssets', replaced.assetId)
    }

    await deleteRecord('workspaceFiles', replaced.id)
  }

  const file: WorkspaceFile = {
    ...existing,
    path: normalizedToPath,
    language: languageForPath(normalizedToPath),
    updatedAt: now(),
  }

  if (file.assetId) {
    const asset = await getRecord('workspaceAssets', file.assetId)

    if (asset) {
      await putRecord('workspaceAssets', {
        ...asset,
        path: normalizedToPath,
        updatedAt: file.updatedAt,
      })
    }
  }

  await putRecord('workspaceFiles', file)
  const nextFiles = sortWorkspaceFiles([
    ...files.filter((item) => item.id !== file.id && item.id !== replaced?.id),
    file,
  ])
  files.splice(0, files.length, ...nextFiles)

  return file
}

export async function deleteProjectWorkspaceDirectory(
  _projectId: string,
  files: WorkspaceFile[],
  path: string,
): Promise<WorkspaceFile[]> {
  const normalizedPath = normalizeWorkspacePath(path)
  const directoryFiles = files.filter((file) => file.path.startsWith(`${normalizedPath}/`))

  if (directoryFiles.length === 0) {
    throw new Error(`Directory not found or empty: ${normalizedPath}`)
  }

  for (const file of directoryFiles) {
    if (file.assetId) {
      await deleteRecord('workspaceAssets', file.assetId)
    }
    await deleteRecord('workspaceFiles', file.id)
  }

  const deletedIds = new Set(directoryFiles.map((file) => file.id))
  const nextFiles = files.filter((file) => !deletedIds.has(file.id))
  files.splice(0, files.length, ...nextFiles)
  return nextFiles
}

export async function renameProjectWorkspaceDirectory(
  _projectId: string,
  files: WorkspaceFile[],
  fromPath: string,
  toPath: string,
): Promise<WorkspaceFile[]> {
  const normalizedFromPath = normalizeWorkspacePath(fromPath)
  const normalizedToPath = normalizeWorkspacePath(toPath)

  if (normalizedFromPath === normalizedToPath) {
    throw new Error('Source and destination directories must be different')
  }
  if (normalizedToPath.startsWith(`${normalizedFromPath}/`)) {
    throw new Error('Cannot move a directory into itself')
  }

  const directoryFiles = files.filter((file) => file.path.startsWith(`${normalizedFromPath}/`))
  if (directoryFiles.length === 0) {
    throw new Error(`Directory not found or empty: ${normalizedFromPath}`)
  }

  const sourceIds = new Set(directoryFiles.map((file) => file.id))
  const moves = directoryFiles.map((file) => ({
    file,
    path: `${normalizedToPath}${file.path.slice(normalizedFromPath.length)}`,
  }))
  const conflict = moves.find(({ path }) =>
    files.some((file) => file.path === path && !sourceIds.has(file.id)),
  )
  if (conflict) {
    throw new Error(`Destination file already exists: ${conflict.path}`)
  }

  const timestamp = now()
  const movedFiles = new Map<string, WorkspaceFile>()
  for (const move of moves) {
    const file: WorkspaceFile = {
      ...move.file,
      path: move.path,
      language: languageForPath(move.path),
      updatedAt: timestamp,
    }
    if (file.assetId) {
      const asset = await getRecord('workspaceAssets', file.assetId)
      if (asset) {
        await putRecord('workspaceAssets', { ...asset, path: move.path, updatedAt: timestamp })
      }
    }
    await putRecord('workspaceFiles', file)
    movedFiles.set(file.id, file)
  }

  const nextFiles = sortWorkspaceFiles(
    files.map((file) => movedFiles.get(file.id) ?? file),
  )
  files.splice(0, files.length, ...nextFiles)
  return moves.map(({ file }) => movedFiles.get(file.id)!)
}
