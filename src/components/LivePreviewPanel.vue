<template>
  <section class="live-preview">
    <iframe
      ref="previewHostFrameRef"
      :key="previewHostFrameUrl"
      aria-hidden="true"
      class="live-preview__host"
      :src="previewHostFrameUrl"
      tabindex="-1"
      @error="handlePreviewHostError"
      @load="handlePreviewHostLoad"
    />

    <header class="live-preview__header">
      <div class="live-preview__actions">
        <PreviewAspectRatioSelect
          v-model="presentationStore.selectedAspectRatio"
          :canvas-size="presentationStore.selectedCanvasSize"
        />
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
        v-else-if="!presentationStore.previewUrl"
        :description="
          previewUnavailable
            ? t('workspace.livePreview.unavailable')
            : t('workspace.livePreview.initializing')
        "
        :image-size="72"
      />
      <div v-else class="live-preview__stage">
        <div
          ref="previewViewportRef"
          class="live-preview__viewport"
          :class="{ 'live-preview__viewport--fixed': selectedAspectRatioValue !== null }"
          :style="previewViewportStyle"
        >
          <iframe
            ref="previewFrameRef"
            :key="presentationStore.previewUrl"
            allowfullscreen
            class="live-preview__frame"
            :class="{
              'live-preview__frame--updating': agentStore.isSelectedProjectRunning,
            }"
            :inert="agentStore.isSelectedProjectRunning"
            :src="presentationStore.mainPreviewUrl"
            tabindex="-1"
            :title="t('workspace.livePreview.title')"
          />
          <div
            v-if="agentStore.isSelectedProjectRunning"
            aria-live="polite"
            class="live-preview__updating"
            role="status"
          >
            {{ t('workspace.livePreview.updating') }}
          </div>
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
import {
  createPreviewHostUrl,
  createPreviewSession,
  isPreviewChannelMessage,
  isPreviewFileRequest,
  isPreviewMessage,
  loadPreviewResource,
  PREVIEW_ORIGIN,
  PREVIEW_PROTOCOL_VERSION,
  type PreviewFileRequest,
  type PreviewFileResponse,
  type PreviewMessage,
} from '@/services/previewOrigin'
import { useAgentStore } from '@/stores/agent'
import { usePresentationStore } from '@/stores/presentation'

const agentStore = useAgentStore()
const presentationStore = usePresentationStore()
const { t } = useI18n()
const previewSession = createPreviewSession()
const previewHostAttempt = ref(0)
const previewHostReady = ref(false)
const previewUnavailable = ref(false)
const previewHostFrameRef = ref<HTMLIFrameElement | null>(null)
const previewFrameRef = ref<HTMLIFrameElement | null>(null)
const previewViewportRef = ref<HTMLDivElement | null>(null)
const isPreviewFullscreen = ref(false)
let previewResizeObserver: ResizeObserver | null = null
let previewHostTimeout: ReturnType<typeof setTimeout> | null = null
let previewHostPort: MessagePort | null = null

const previewHostFrameUrl = computed(() =>
  createPreviewHostUrl(previewSession, previewHostAttempt.value),
)

const selectedCanvasSize = computed(() => presentationStore.selectedCanvasSize)
const selectedAspectRatioValue = computed(() => {
  const size = selectedCanvasSize.value

  return size ? size.width / size.height : null
})
const canUseFullscreen = computed(
  () =>
    Boolean(presentationStore.indexFile) &&
    Boolean(presentationStore.previewUrl) &&
    document.fullscreenEnabled &&
    Boolean(previewViewportRef.value?.requestFullscreen),
)

const previewViewportStyle = computed<Partial<Record<string, string>>>(() => {
  const size = selectedCanvasSize.value

  if (!size) {
    return {}
  }

  return {
    '--preview-aspect-ratio': (size.width / size.height).toString(),
    '--preview-canvas-width': `${size.width}px`,
    '--preview-canvas-height': `${size.height}px`,
  }
})

const indexFile = computed(() => presentationStore.indexFile)

onMounted(() => {
  presentationStore.beginPreviewSession(previewSession)
  window.addEventListener('message', handlePreviewMessage)
  document.addEventListener('fullscreenchange', syncFullscreenState)
  previewResizeObserver = new ResizeObserver(updatePreviewScale)
  startPreviewHostTimeout()
})

onUnmounted(() => {
  clearPreviewHostTimeout()
  closePreviewHostPort()
  presentationStore.endPreviewSession(previewSession)
  window.removeEventListener('message', handlePreviewMessage)
  previewResizeObserver?.disconnect()
  document.removeEventListener('fullscreenchange', syncFullscreenState)
})

watch(selectedCanvasSize, () => requestAnimationFrame(updatePreviewScale))
watch(previewViewportRef, (viewport, previousViewport) => {
  if (previousViewport) {
    previewResizeObserver?.unobserve(previousViewport)
  }
  if (viewport) {
    previewResizeObserver?.observe(viewport)
    updatePreviewScale()
  }
})

watch(
  () => presentationStore.activeSlidePage,
  (page) => {
    if (!agentStore.isSelectedProjectRunning) {
      navigatePreviewFrameToSlide(page)
    }
  },
)
watch(
  () => agentStore.isSelectedProjectRunning,
  (isRunning) => {
    if (isRunning && document.activeElement === previewFrameRef.value) {
      previewFrameRef.value?.blur()
    }
  },
)
watch(
  () =>
    [
      agentStore.selectedProjectId,
      presentationStore.committedPreviewVersion,
      presentationStore.indexFile?.path ?? '',
    ] as const,
  () => {
    previewUnavailable.value = false

    if (previewHostReady.value) {
      markPreviewSourceReady()
    } else if (agentStore.selectedProjectId && presentationStore.indexFile) {
      restartPreviewHost()
    }
  },
)

function navigatePreviewFrameToSlide(page: number) {
  const frameWindow = previewFrameRef.value?.contentWindow

  if (frameWindow) {
    frameWindow.postMessage(
      {
        protocol: PREVIEW_PROTOCOL_VERSION,
        type: 'preview:set-slide',
        session: previewSession,
        page,
      },
      PREVIEW_ORIGIN,
    )
  }
}

function handlePreviewHostLoad() {
  if (!previewHostReady.value) {
    startPreviewHostTimeout()
  }
}

function handlePreviewHostError() {
  previewHostReady.value = false
  markPreviewUnavailable()
}

function handlePreviewMessage(event: MessageEvent) {
  if (
    event.origin !== PREVIEW_ORIGIN ||
    !isPreviewMessage(event.data) ||
    event.data.session !== previewSession
  ) {
    return
  }

  if (event.source === previewHostFrameRef.value?.contentWindow) {
    handlePreviewHostWindowMessage(event.data)
    return
  }

  if (
    event.source !== previewFrameRef.value?.contentWindow ||
    !isCurrentPreviewDocumentMessage(event.data)
  ) {
    return
  }

  if (event.data.type === 'preview:ready') {
    navigatePreviewFrameToSlide(presentationStore.activeSlidePage)
    return
  }

  if (event.data.type === 'preview:slide-change' && Number.isInteger(event.data.page)) {
    presentationStore.selectSlide(event.data.page as number)
  }
}

function handlePreviewHostWindowMessage(message: PreviewMessage) {
  if (message.type === 'preview:channel-request' && message.target === 'host') {
    connectPreviewHost()
    return
  }

  if (message.type === 'preview:error' && message.target === 'host') {
    previewHostReady.value = false
    closePreviewHostPort()
    markPreviewUnavailable()
  }
}

function connectPreviewHost() {
  const hostWindow = previewHostFrameRef.value?.contentWindow

  if (!hostWindow) {
    return
  }

  closePreviewHostPort()
  const channel = new MessageChannel()

  previewHostPort = channel.port1
  previewHostPort.onmessage = handlePreviewHostPortMessage
  previewHostPort.onmessageerror = restartPreviewHost
  previewHostPort.start()
  startPreviewHostTimeout()

  hostWindow.postMessage(
    {
      protocol: PREVIEW_PROTOCOL_VERSION,
      type: 'preview:channel',
      session: previewSession,
    },
    PREVIEW_ORIGIN,
    [channel.port2],
  )
}

function handlePreviewHostPortMessage(event: MessageEvent) {
  if (isPreviewChannelMessage(event.data) && event.data.session === previewSession) {
    clearPreviewHostTimeout()
    previewHostReady.value = true
    previewUnavailable.value = false
    markPreviewSourceReady()
    return
  }

  if (!isPreviewFileRequest(event.data)) {
    return
  }

  const responsePort = event.ports[0]

  if (!responsePort) {
    return
  }

  void respondToPreviewFileRequest(event.data, responsePort)
}

async function respondToPreviewFileRequest(
  request: PreviewFileRequest,
  responsePort: MessagePort,
) {
  if (
    request.session !== previewSession ||
    request.projectId !== agentStore.selectedProjectId ||
    request.version !== presentationStore.committedPreviewVersion ||
    agentStore.isSelectedProjectRunning
  ) {
    respondWithPreviewFile(request, responsePort, {
      protocol: PREVIEW_PROTOCOL_VERSION,
      type: 'preview:file-response',
      requestId: request.requestId,
      status: 409,
      message: 'Preview source changed',
    })
    return
  }

  try {
    const resource = await loadPreviewResource(request.projectId, request.path)

    if (
      request.session !== previewSession ||
      request.projectId !== agentStore.selectedProjectId ||
      request.version !== presentationStore.committedPreviewVersion ||
      agentStore.isSelectedProjectRunning
    ) {
      respondWithPreviewFile(request, responsePort, {
        protocol: PREVIEW_PROTOCOL_VERSION,
        type: 'preview:file-response',
        requestId: request.requestId,
        status: 409,
        message: 'Preview source changed',
      })
      return
    }

    const response: PreviewFileResponse = resource
      ? {
          protocol: PREVIEW_PROTOCOL_VERSION,
          type: 'preview:file-response',
          requestId: request.requestId,
          status: 200,
          resource,
        }
      : {
          protocol: PREVIEW_PROTOCOL_VERSION,
          type: 'preview:file-response',
          requestId: request.requestId,
          status: 404,
          message: 'Preview resource not found',
        }

    respondWithPreviewFile(request, responsePort, response)
  } catch {
    respondWithPreviewFile(request, responsePort, {
      protocol: PREVIEW_PROTOCOL_VERSION,
      type: 'preview:file-response',
      requestId: request.requestId,
      status: 503,
      message: 'Unable to read preview resource',
    })
  }
}

function respondWithPreviewFile(
  request: PreviewFileRequest,
  responsePort: MessagePort,
  response: PreviewFileResponse,
) {
  if (response.requestId !== request.requestId) {
    responsePort.close()
    return
  }

  try {
    responsePort.postMessage(response)
  } finally {
    responsePort.close()
  }
}

function markPreviewSourceReady() {
  const projectId = agentStore.selectedProjectId
  const version = presentationStore.committedPreviewVersion
  const indexPath = presentationStore.indexFile?.path

  if (!previewHostReady.value || !projectId || !indexPath) {
    return
  }

  if (
    presentationStore.markPreviewSourceReady(
      previewSession,
      projectId,
      version,
      indexPath,
    )
  ) {
    previewUnavailable.value = false
  }
}

function isCurrentPreviewDocumentMessage(message: PreviewMessage): boolean {
  if (
    message.projectId !== agentStore.selectedProjectId ||
    !message.version ||
    !presentationStore.previewUrl
  ) {
    return false
  }

  return new URL(presentationStore.previewUrl).searchParams.get('v') === message.version
}

function restartPreviewHost() {
  closePreviewHostPort()
  previewHostReady.value = false
  previewUnavailable.value = false
  previewHostAttempt.value += 1
  startPreviewHostTimeout()
}

function startPreviewHostTimeout() {
  clearPreviewHostTimeout()
  previewHostTimeout = setTimeout(() => {
    previewHostReady.value = false
    markPreviewUnavailable()
  }, 10_000)
}

function clearPreviewHostTimeout() {
  if (previewHostTimeout) {
    clearTimeout(previewHostTimeout)
    previewHostTimeout = null
  }
}

function markPreviewUnavailable() {
  clearPreviewHostTimeout()
  previewUnavailable.value = true
}

function closePreviewHostPort() {
  previewHostPort?.close()
  previewHostPort = null
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

    await previewViewportRef.value?.requestFullscreen()
    focusPreviewFrame()
  } catch {
    syncFullscreenState()
  }
}

function syncFullscreenState() {
  isPreviewFullscreen.value = document.fullscreenElement === previewViewportRef.value

  if (isPreviewFullscreen.value) {
    focusPreviewFrame()
  }
}

function updatePreviewScale() {
  const viewport = previewViewportRef.value
  const canvasSize = selectedCanvasSize.value

  if (!viewport || !canvasSize) {
    viewport?.style.removeProperty('--preview-canvas-scale')
    return
  }

  const scale = Math.min(
    viewport.clientWidth / canvasSize.width,
    viewport.clientHeight / canvasSize.height,
  )
  viewport.style.setProperty('--preview-canvas-scale', String(scale))
}

function focusPreviewFrame() {
  requestAnimationFrame(() => {
    previewFrameRef.value?.focus()
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

.live-preview__host {
  display: none;
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
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
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

.live-preview__frame--updating {
  pointer-events: none;
}

.live-preview__updating {
  position: absolute;
  z-index: 1;
  right: 12px;
  bottom: 12px;
  padding: 7px 10px;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 8px;
  background: rgb(17 19 24 / 82%);
  color: #ffffff;
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
}

.live-preview__viewport--fixed .live-preview__frame {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--preview-canvas-width);
  height: var(--preview-canvas-height);
  transform: translate(-50%, -50%) scale(var(--preview-canvas-scale, 0));
}

.live-preview__viewport:fullscreen {
  background: #111318;
}

</style>
