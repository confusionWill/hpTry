<template>
  <section class="live-preview">
    <header class="live-preview__header">
      <div>
        <h2>{{ t('workspace.livePreview.title') }}</h2>
        <p>{{ previewPathLabel }}</p>
      </div>
    </header>

    <div class="live-preview__body">
      <UiEmpty
        v-if="!indexFile"
        :description="t('workspace.livePreview.missingIndex')"
        :image-size="72"
      />
      <UiEmpty
        v-else-if="!previewWorkerReady"
        :description="t('workspace.livePreview.unavailable')"
        :image-size="72"
      />
      <iframe
        v-else
        :key="previewUrl"
        class="live-preview__frame"
        :src="previewUrl"
        :title="t('workspace.livePreview.title')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiEmpty from '@/components/ui/UiEmpty.vue'
import { useAgentStore } from '@/stores/agent'
import type { WorkspaceFile } from '@/types/agent'

const store = useAgentStore()
const { t } = useI18n()
const previewWorkerReady = ref(false)

const fileMap = computed(() => {
  const files = new Map<string, WorkspaceFile>()

  for (const file of store.workspaceFiles) {
    files.set(normalizePath(file.path), file)
  }

  return files
})

const indexFile = computed(() => {
  const rootIndex = fileMap.value.get('hp.html')

  if (rootIndex) {
    return rootIndex
  }

  return store.workspaceFiles.find((file) => normalizePath(file.path).endsWith('/hp.html'))
})

const previewPathLabel = computed(() => indexFile.value?.path ?? t('workspace.livePreview.noEntry'))

const previewVersion = computed(() =>
  store.workspaceFiles
    .map((file) => file.updatedAt)
    .reduce((latest, updatedAt) => Math.max(latest, updatedAt), 0)
    .toString(),
)

const previewUrl = computed(() => {
  if (!store.selectedProjectId || !indexFile.value) {
    return ''
  }

  return `/preview/${encodeURIComponent(store.selectedProjectId)}/${encodePreviewPath(
    indexFile.value.path,
  )}?v=${encodeURIComponent(previewVersion.value)}`
})

onMounted(async () => {
  previewWorkerReady.value = await registerPreviewWorker()
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

async function registerPreviewWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.register('/preview-worker.js', {
      scope: '/',
    })
    await waitForWorkerActivation(registration)
    await navigator.serviceWorker.ready

    return true
  } catch {
    return false
  }
}

function waitForWorkerActivation(registration: ServiceWorkerRegistration): Promise<void> {
  const worker = registration.installing ?? registration.waiting ?? registration.active

  if (!worker || worker.state === 'activated') {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        resolve()
      }
    })
  })
}
</script>

<style scoped>
.live-preview {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid var(--ui-border-color-light);
  background: var(--ui-bg-color);
}

.live-preview__header {
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--ui-border-color-light);
  padding: 14px 18px;
}

.live-preview__header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}

.live-preview__header p {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.live-preview__body {
  display: grid;
  min-width: 0;
  min-height: 0;
  flex: 1;
  background: var(--ui-fill-color-light);
  place-items: center;
}

.live-preview__frame {
  width: 100%;
  height: 100%;
  border: 0;
  background: #ffffff;
}
</style>
