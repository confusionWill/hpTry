import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { parsePresentationManifest } from '@/services/presentationManifest'
import { useAgentStore } from '@/stores/agent'
import type { WorkspaceFile } from '@/types/agent'

export const usePresentationStore = defineStore('presentation', () => {
  const agentStore = useAgentStore()
  const activeSlidePage = ref(1)
  const committedPreviewVersion = ref('0')

  const fileMap = computed(() => {
    const files = new Map<string, WorkspaceFile>()

    for (const file of agentStore.workspaceFiles) {
      files.set(normalizePath(file.path), file)
    }

    return files
  })

  const indexFile = computed(() => {
    const rootIndex = fileMap.value.get('hp.html')

    if (rootIndex) {
      return rootIndex
    }

    return agentStore.workspaceFiles.find((file) => normalizePath(file.path).endsWith('/hp.html'))
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

  const latestWorkspaceVersion = computed(() =>
    agentStore.workspaceFiles
      .filter((file) => !normalizePath(file.path).startsWith('.tmp/'))
      .map((file) => file.updatedAt)
      .reduce((latest, updatedAt) => Math.max(latest, updatedAt), 0)
      .toString(),
  )

  const previewUrl = computed(() => {
    if (!agentStore.selectedProjectId || !indexFile.value) {
      return ''
    }

    return `/preview/${encodeURIComponent(agentStore.selectedProjectId)}/${encodePreviewPath(
      indexFile.value.path,
    )}?v=${encodeURIComponent(committedPreviewVersion.value)}`
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

  function selectSlide(page: number) {
    const slideCount = manifest.value?.slides.length ?? 0

    if (Number.isInteger(page) && page >= 1 && page <= slideCount) {
      activeSlidePage.value = page
    }
  }

  return {
    activeSlidePage,
    indexFile,
    mainPreviewUrl,
    manifest,
    previewUrl,
    selectSlide,
  }
})

function encodePreviewPath(path: string): string {
  return normalizePath(path).split('/').map(encodeURIComponent).join('/')
}

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
