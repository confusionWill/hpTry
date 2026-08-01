import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import {
  DEFAULT_PRESENTATION_SIZE,
  parsePresentationManifest,
} from '@/services/presentationManifest'
import { createPreviewDocumentUrl } from '@/services/previewOrigin'
import { useAgentStore } from '@/stores/agent'
import type { WorkspaceFile } from '@/types/agent'
import {
  PREVIEW_CANVAS_SIZE_MAP,
  type PreviewAspectRatio,
  type PreviewAspectRatioSelection,
} from '@/utils/presentationCanvas'

export const usePresentationStore = defineStore('presentation', () => {
  const agentStore = useAgentStore()
  const activeSlidePage = ref(1)
  const committedPreviewVersion = ref('0')
  const previewSession = ref('')
  const mirroredProjectId = ref('')
  const mirroredPreviewVersion = ref('')
  const mirroredIndexPath = ref('')
  const selectedAspectRatioState = ref<PreviewAspectRatioSelection>('16-9')
  const selectedAspectRatio = computed<PreviewAspectRatioSelection>({
    get: () => selectedAspectRatioState.value,
    set: (value) => {
      selectedAspectRatioState.value = value
      if (value !== 'custom') {
        void syncManifestSize(value)
      }
    },
  })
  const fileMap = computed(() => {
    const files = new Map<string, WorkspaceFile>()

    for (const file of agentStore.workspaceFiles) {
      files.set(normalizePath(file.path), file)
    }

    return files
  })

  const indexFile = computed(() => {
    const rootIndex = agentStore.workspaceFiles.find((file) => {
      const normalizedPath = normalizePath(file.path)

      return !normalizedPath.includes('/') && isPreviewEntryPath(normalizedPath)
    })

    if (rootIndex) {
      return rootIndex
    }

    return agentStore.workspaceFiles.find((file) => {
      const normalizedPath = normalizePath(file.path)

      return normalizedPath.includes('/') && isPreviewEntryPath(normalizedPath)
    })
  })

  const manifestFile = computed(() => {
    if (!indexFile.value) {
      return undefined
    }

    const normalizedIndexPath = normalizePath(indexFile.value.path)
    const directory = normalizedIndexPath.includes('/')
      ? normalizedIndexPath.slice(0, normalizedIndexPath.lastIndexOf('/'))
      : ''
    const manifestPath = directory ? `${directory}/manifest.json` : 'manifest.json'

    return fileMap.value.get(manifestPath)
  })

  const manifest = computed(() => {
    if (!manifestFile.value || manifestFile.value.kind === 'asset') {
      return null
    }

    return parsePresentationManifest(manifestFile.value.content)
  })

  const selectedCanvasSize = computed(
    () =>
      manifest.value?.size ??
      (selectedAspectRatioState.value === 'custom'
        ? DEFAULT_PRESENTATION_SIZE
        : PREVIEW_CANVAS_SIZE_MAP[selectedAspectRatioState.value]),
  )

  const latestWorkspaceVersion = computed(() =>
    agentStore.workspaceFiles
      .filter((file) => !normalizePath(file.path).startsWith('.tmp/'))
      .map((file) => file.updatedAt)
      .reduce((latest, updatedAt) => Math.max(latest, updatedAt), 0)
      .toString(),
  )

  const previewUrl = computed(() => {
    if (
      !agentStore.selectedProjectId ||
      !indexFile.value ||
      !previewSession.value ||
      mirroredProjectId.value !== agentStore.selectedProjectId ||
      !mirroredPreviewVersion.value ||
      !mirroredIndexPath.value
    ) {
      return ''
    }

    return createPreviewDocumentUrl(
      mirroredProjectId.value,
      mirroredIndexPath.value,
      mirroredPreviewVersion.value,
      previewSession.value,
    )
  })

  const mainPreviewUrl = computed(() =>
    previewUrl.value ? `${previewUrl.value}#slide=${activeSlidePage.value}` : '',
  )

  watch(
    [latestWorkspaceVersion, () => agentStore.isSelectedProjectRunning],
    ([latestVersion, isRunning], [, wasRunning]) => {
      if (isRunning) {
        return
      }

      if (wasRunning || committedPreviewVersion.value !== latestVersion) {
        committedPreviewVersion.value = latestVersion
      }
    },
    { immediate: true },
  )

  watch(
    () => agentStore.selectedProjectId,
    () => {
      activeSlidePage.value = 1
      clearMirroredPreview()
    },
  )

  watch(
    () => manifest.value?.slides.length ?? 0,
    (slideCount) => {
      if (slideCount > 0 && activeSlidePage.value > slideCount) {
        activeSlidePage.value = slideCount
      }
    },
  )

  watch(
    () => [agentStore.selectedProjectId, manifest.value?.size] as const,
    ([, manifestSize]) => {
      const size = manifestSize ?? DEFAULT_PRESENTATION_SIZE

      const aspectRatio = findAspectRatioForSize(size.width, size.height)

      selectedAspectRatioState.value = aspectRatio ?? 'custom'
    },
    { immediate: true },
  )

  async function syncManifestSize(aspectRatio: PreviewAspectRatio): Promise<void> {
    const projectId = agentStore.selectedProjectId
    const file = manifestFile.value

    if (!projectId || !file || file.kind === 'asset') {
      return
    }

    try {
      const value = JSON.parse(file.content) as Record<string, unknown>
      const size = PREVIEW_CANVAS_SIZE_MAP[aspectRatio]
      const currentSize = value.size as Partial<typeof size> | undefined

      if (currentSize?.width === size.width && currentSize.height === size.height) {
        return
      }

      value.size = { ...size }

      await agentStore.upsertWorkspaceFile(
        projectId,
        [...agentStore.workspaceFiles],
        file.path,
        `${JSON.stringify(value, null, 2)}\n`,
        false,
      )
    } catch {
      const size = manifest.value?.size
      const persistedAspectRatio = size
        ? findAspectRatioForSize(size.width, size.height)
        : undefined

      if (persistedAspectRatio) {
        selectedAspectRatioState.value = persistedAspectRatio
      }
    }
  }

  function selectSlide(page: number) {
    const slideCount = manifest.value?.slides.length ?? 0

    if (Number.isInteger(page) && page >= 1 && page <= slideCount) {
      activeSlidePage.value = page
    }
  }

  function beginPreviewSession(session: string) {
    previewSession.value = session
    clearMirroredPreview()
  }

  function endPreviewSession(session: string) {
    if (previewSession.value !== session) {
      return
    }

    previewSession.value = ''
    clearMirroredPreview()
  }

  function markPreviewSourceReady(
    session: string,
    projectId: string,
    version: string,
    indexPath: string,
  ): boolean {
    if (
      session !== previewSession.value ||
      projectId !== agentStore.selectedProjectId ||
      version !== committedPreviewVersion.value ||
      normalizePath(indexPath) !== normalizePath(indexFile.value?.path ?? '')
    ) {
      return false
    }

    mirroredProjectId.value = projectId
    mirroredPreviewVersion.value = version
    mirroredIndexPath.value = normalizePath(indexPath)
    return true
  }

  function clearMirroredPreview() {
    mirroredProjectId.value = ''
    mirroredPreviewVersion.value = ''
    mirroredIndexPath.value = ''
  }

  return {
    activeSlidePage,
    beginPreviewSession,
    committedPreviewVersion,
    endPreviewSession,
    indexFile,
    mainPreviewUrl,
    manifest,
    markPreviewSourceReady,
    previewUrl,
    selectedAspectRatio,
    selectedCanvasSize,
    selectSlide,
  }
})

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

function isPreviewEntryPath(path: string): boolean {
  return path.split('/').pop()?.toLowerCase() === 'hp.html'
}

function findAspectRatioForSize(width: number, height: number): PreviewAspectRatio | undefined {
  const exactMatch = Object.entries(PREVIEW_CANVAS_SIZE_MAP).find(
    ([, size]) => size.width === width && size.height === height,
  )

  return exactMatch?.[0] as PreviewAspectRatio | undefined
}
