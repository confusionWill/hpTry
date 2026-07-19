<template>
  <section class="live-preview">
    <header class="live-preview__header">
      <div class="live-preview__actions">
        <PreviewAspectRatioSelect v-model="selectedAspectRatio" />
        <UiButton
          :aria-label="
            isPreviewFullscreen
              ? t('workspace.livePreview.exitFullscreen')
              : t('workspace.livePreview.enterFullscreen')
          "
          :disabled="!canUseFullscreen"
          circle
          @click="togglePreviewFullscreen"
        >
          <template #icon>
            <Minimize2 v-if="isPreviewFullscreen" :size="16" />
            <Maximize2 v-else :size="16" />
          </template>
        </UiButton>
        <WorkspaceExportButton />
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
      <div v-else class="live-preview__stage">
        <div
          class="live-preview__viewport"
          :class="{ 'live-preview__viewport--fixed': selectedAspectRatioValue !== null }"
          :style="previewViewportStyle"
        >
          <iframe
            ref="previewFrameRef"
            :key="presentationStore.previewUrl"
            allowfullscreen
            class="live-preview__frame"
            :src="presentationStore.mainPreviewUrl"
            tabindex="-1"
            :title="t('workspace.livePreview.title')"
            @load="handlePreviewFrameLoad"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Maximize2, Minimize2 } from '@lucide/vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import PreviewAspectRatioSelect from '@/components/PreviewAspectRatioSelect.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import WorkspaceExportButton from '@/components/WorkspaceExportButton.vue'
import { usePresentationStore } from '@/stores/presentation'

const presentationStore = usePresentationStore()
const { t } = useI18n()
const previewWorkerReady = ref(false)
const previewFrameRef = ref<HTMLIFrameElement | null>(null)
const isPreviewFullscreen = ref(false)
let observedPreviewWindow: Window | null = null

const selectedAspectRatio = ref('none')

const aspectRatioMap: Record<string, number | null> = {
  '16-9': 16 / 9,
  '21-9': 21 / 9,
  '9-16': 9 / 16,
  '4-3': 4 / 3,
  '3-4': 3 / 4,
  none: null,
}

const selectedAspectRatioValue = computed(() => aspectRatioMap[selectedAspectRatio.value] ?? null)
const canUseFullscreen = computed(
  () =>
    Boolean(presentationStore.indexFile) &&
    previewWorkerReady.value &&
    document.fullscreenEnabled &&
    Boolean(previewFrameRef.value?.requestFullscreen),
)

const previewViewportStyle = computed<Partial<Record<string, string>>>(() => {
  if (selectedAspectRatioValue.value === null) {
    return {}
  }

  return {
    '--preview-aspect-ratio': selectedAspectRatioValue.value.toString(),
  }
})

const indexFile = computed(() => presentationStore.indexFile)

onMounted(async () => {
  previewWorkerReady.value = await registerPreviewWorker()
  document.addEventListener('fullscreenchange', syncFullscreenState)
})

onUnmounted(() => {
  detachPreviewHashListener()
  document.removeEventListener('fullscreenchange', syncFullscreenState)
})

watch(
  () => presentationStore.activeSlidePage,
  (page) => {
    navigatePreviewFrameToSlide(page)
  },
)
function navigatePreviewFrameToSlide(page: number) {
  const frameWindow = previewFrameRef.value?.contentWindow

  if (frameWindow) {
    try {
      const params = new URLSearchParams(frameWindow.location.hash.slice(1))
      params.set('slide', String(page))
      params.delete('mode')
      frameWindow.location.hash = params.toString()
    } catch {
      // The reactive iframe src remains the fallback if the frame is not ready yet.
    }
  }
}

function handlePreviewFrameLoad() {
  detachPreviewHashListener()
  observedPreviewWindow = previewFrameRef.value?.contentWindow ?? null
  observedPreviewWindow?.addEventListener('hashchange', syncActiveSlideFromFrame)
  syncActiveSlideFromFrame()
}

function detachPreviewHashListener() {
  observedPreviewWindow?.removeEventListener('hashchange', syncActiveSlideFromFrame)
  observedPreviewWindow = null
}

function syncActiveSlideFromFrame() {
  if (!observedPreviewWindow) {
    return
  }

  try {
    const params = new URLSearchParams(observedPreviewWindow.location.hash.slice(1))
    const page = Number.parseInt(params.get('slide') ?? '', 10)
    const slideCount = presentationStore.manifest?.slides.length ?? 0

    if (Number.isInteger(page) && page >= 1 && page <= slideCount) {
      presentationStore.selectSlide(page)
    }
  } catch {
    // Ignore an inaccessible frame while its document is being replaced.
  }
}

async function togglePreviewFullscreen() {
  if (!canUseFullscreen.value) {
    return
  }

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }

    await previewFrameRef.value?.requestFullscreen()
    focusPreviewFrame()
  } catch {
    syncFullscreenState()
  }
}

function syncFullscreenState() {
  isPreviewFullscreen.value = document.fullscreenElement === previewFrameRef.value

  if (isPreviewFullscreen.value) {
    focusPreviewFrame()
  }
}

function focusPreviewFrame() {
  requestAnimationFrame(() => {
    previewFrameRef.value?.focus()
  })
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
  background: transparent;
}

.live-preview__header {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 7px 12px;
}

.live-preview__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}

.live-preview__body {
  display: grid;
  min-width: 0;
  min-height: 0;
  flex: 1;
  background: transparent;
  container-type: size;
  place-items: center;
}

.live-preview__stage {
  display: grid;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  container-type: size;
  place-items: center;
}

.live-preview__viewport {
  width: 100%;
  height: 100%;
  background: #ffffff;
  /* box-shadow: 0 0 10px #eee; */
}

.live-preview__viewport--fixed {
  width: min(100%, calc(100cqh * var(--preview-aspect-ratio)));
  height: auto;
  max-height: 100%;
  aspect-ratio: var(--preview-aspect-ratio);
}

.live-preview__frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #ffffff;
}

</style>
