<template>
  <UiDialog
    v-model="model"
    :aria-label="t('workspace.previewDialog.ariaLabel')"
    :show-header="true"
    :title="file?.path ?? t('workspace.preview')"
    width="min(920px, 92vw)"
  >
    <template #header>
      <h2 class="file-preview-dialog__title">
        {{ file ? fileNameForPath(file.path) : t('workspace.preview') }}
      </h2>
    </template>

    <UiEmpty
      v-if="!file"
      :description="t('workspace.emptyPreview')"
      :image-size="52"
    />
    <div v-else class="file-preview-dialog">
      <pre v-if="previewType === 'text'" class="file-preview-dialog__text"><code>{{ textContent }}</code></pre>
      <div v-else-if="previewType === 'image'" class="file-preview-dialog__media">
        <img
          v-if="mediaSource"
          :alt="file.path"
          :src="mediaSource"
        />
        <UiEmpty
          v-else
          :description="t('workspace.previewDialog.unavailable')"
          :image-size="52"
        />
      </div>
      <div v-else-if="previewType === 'video'" class="file-preview-dialog__media">
        <video
          v-if="mediaSource"
          :src="mediaSource"
          controls
        />
        <UiEmpty
          v-else
          :description="t('workspace.previewDialog.unavailable')"
          :image-size="52"
        />
      </div>
      <div v-else-if="previewType === 'audio'" class="file-preview-dialog__media">
        <audio
          v-if="mediaSource"
          :src="mediaSource"
          controls
        />
        <UiEmpty
          v-else
          :description="t('workspace.previewDialog.unavailable')"
          :image-size="52"
        />
      </div>
      <div v-else-if="previewType === 'pdf'" class="file-preview-dialog__media">
        <iframe
          v-if="mediaSource"
          class="file-preview-dialog__frame"
          :src="mediaSource"
          :title="file.path"
        />
        <UiEmpty
          v-else
          :description="t('workspace.previewDialog.unavailable')"
          :image-size="52"
        />
      </div>
      <UiEmpty
        v-else
        :description="t('workspace.previewDialog.unsupported')"
        :image-size="52"
      />
    </div>
  </UiDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import UiDialog from '@/components/ui/UiDialog.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import { loadWorkspaceAsset } from '@/services/agent/workspaceFiles'
import type { WorkspaceFile } from '@/types/agent'

type PreviewType = 'audio' | 'image' | 'pdf' | 'text' | 'unsupported' | 'video'

const model = defineModel<boolean>({ required: true })

const props = defineProps<{
  file?: WorkspaceFile
}>()

const { t } = useI18n()
const assetObjectUrl = ref('')
const assetTextContent = ref('')

const previewType = computed<PreviewType>(() => getPreviewType(props.file))
const mediaSource = computed(() => {
  if (
    !props.file ||
    !['audio', 'image', 'pdf', 'video'].includes(previewType.value)
  ) {
    return ''
  }

  if (props.file.kind === 'asset') {
    return assetObjectUrl.value
  }

  return sourceForMedia(props.file)
})
const textContent = computed(() => {
  if (!props.file) {
    return ''
  }

  if (props.file.kind === 'asset') {
    return assetTextContent.value
  }

  return props.file.content
})

watch(
  () => props.file,
  (file) => {
    void loadAssetPreview(file)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  revokeAssetObjectUrl()
})

function getPreviewType(file?: WorkspaceFile): PreviewType {
  if (!file) {
    return 'unsupported'
  }

  const mimeType = file.mimeType ?? mimeTypeForPath(file.path)
  const extension = extensionForPath(file.path)

  if (mimeType.startsWith('image/')) {
    return 'image'
  }

  if (mimeType.startsWith('video/')) {
    return 'video'
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio'
  }

  if (mimeType === 'application/pdf') {
    return 'pdf'
  }

  if (file.kind === 'asset') {
    return isTextAsset(file) ? 'text' : 'unsupported'
  }

  return binaryExtensions.has(extension) ? 'unsupported' : 'text'
}

async function loadAssetPreview(file?: WorkspaceFile) {
  revokeAssetObjectUrl()
  assetTextContent.value = ''

  if (!file || file.kind !== 'asset') {
    return
  }

  const asset = await loadWorkspaceAsset(file)

  if (!asset) {
    return
  }

  if (['audio', 'image', 'pdf', 'video'].includes(getPreviewType(file))) {
    assetObjectUrl.value = URL.createObjectURL(asset.blob)
    return
  }

  if (isTextAsset(file) && asset.size <= 240_000) {
    assetTextContent.value = await asset.blob.text()
  }
}

function revokeAssetObjectUrl() {
  if (!assetObjectUrl.value) {
    return
  }

  URL.revokeObjectURL(assetObjectUrl.value)
  assetObjectUrl.value = ''
}

function isTextAsset(file: WorkspaceFile): boolean {
  const mimeType = file.mimeType ?? ''

  return (
    mimeType.startsWith('text/') ||
    [
      'application/json',
      'application/javascript',
      'application/xml',
      'image/svg+xml',
    ].includes(mimeType)
  )
}

function sourceForMedia(file: WorkspaceFile): string {
  const content = file.content.trim()

  if (content.startsWith('data:')) {
    return content
  }

  const mimeType = mimeTypeForPath(file.path)

  if (!mimeType) {
    return ''
  }

  if (mimeType === 'image/svg+xml' && content.startsWith('<svg')) {
    return `data:${mimeType};utf8,${encodeURIComponent(content)}`
  }

  const base64Content = content.replace(/\s/g, '')

  if (isBase64Content(base64Content)) {
    return `data:${mimeType};base64,${base64Content}`
  }

  return ''
}

function mimeTypeForPath(path: string): string {
  const extension = extensionForPath(path)

  return (
    imageMimeTypes[extension] ??
    videoMimeTypes[extension] ??
    audioMimeTypes[extension] ??
    documentMimeTypes[extension] ??
    'text/plain'
  )
}

function extensionForPath(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? ''
}

function fileNameForPath(path: string): string {
  return path.split('/').pop() ?? path
}

function isBase64Content(content: string): boolean {
  return Boolean(content) && /^[A-Za-z0-9+/=]+$/.test(content) && content.length % 4 === 0
}

const imageMimeTypes: Record<string, string> = {
  apng: 'image/apng',
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

const videoMimeTypes: Record<string, string> = {
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  ogv: 'video/ogg',
  webm: 'video/webm',
}

const audioMimeTypes: Record<string, string> = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
}

const documentMimeTypes: Record<string, string> = {
  pdf: 'application/pdf',
}

const binaryExtensions = new Set([
  '7z',
  'bz2',
  'dmg',
  'doc',
  'docx',
  'exe',
  'gz',
  'ppt',
  'pptx',
  'rar',
  'tar',
  'xls',
  'xlsx',
  'zip',
])
</script>

<style scoped>
.file-preview-dialog {
  display: flex;
  min-height: min(62vh, 560px);
  min-width: 0;
  flex-direction: column;
}

.file-preview-dialog__title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  margin: 0;
  color: var(--ui-text-color-primary);
  font-size: 16px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-preview-dialog__text {
  min-width: 0;
  margin: 0;
}

.file-preview-dialog__text code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.6;
}

.file-preview-dialog > :deep(.ui-empty) {
  min-height: 0;
  flex: 1;
  place-content: center;
}

.file-preview-dialog__media {
  display: grid;
  min-height: 0;
  flex: 1;
  place-items: center;
  background: var(--ui-fill-color-lighter);
}

.file-preview-dialog__media img,
.file-preview-dialog__media video {
  display: block;
  max-width: 100%;
  max-height: 60vh;
}

.file-preview-dialog__media audio {
  width: min(520px, 86%);
}

.file-preview-dialog__frame {
  width: 100%;
  height: 100%;
  min-height: min(62vh, 560px);
  border: 0;
}
</style>
