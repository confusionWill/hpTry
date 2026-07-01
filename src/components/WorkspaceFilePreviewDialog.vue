<template>
  <UiDialog
    v-model="model"
    :aria-label="t('workspace.previewDialog.ariaLabel')"
    :close-label="t('common.close')"
    :show-close="true"
    :show-header="true"
    :title="file?.path ?? t('workspace.preview')"
    width="min(920px, 92vw)"
  >
    <UiEmpty
      v-if="!file"
      :description="t('workspace.emptyPreview')"
      :image-size="52"
    />
    <div v-else class="file-preview-dialog">
      <div class="file-preview-dialog__meta">
        <span>{{ file.path }}</span>
        <small>{{ previewLabel }}</small>
      </div>

      <pre v-if="previewType === 'text'" class="file-preview-dialog__text"><code>{{ file.content }}</code></pre>
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
      <UiEmpty
        v-else
        :description="t('workspace.previewDialog.unsupported')"
        :image-size="52"
      />
    </div>
  </UiDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import UiDialog from '@/components/ui/UiDialog.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import type { WorkspaceFile } from '@/types/agent'

type PreviewType = 'image' | 'text' | 'unsupported' | 'video'

const model = defineModel<boolean>({ required: true })

const props = defineProps<{
  file?: WorkspaceFile
}>()

const { t } = useI18n()

const previewType = computed<PreviewType>(() => getPreviewType(props.file))
const previewLabel = computed(() => {
  if (!props.file) {
    return ''
  }

  return mimeTypeForPath(props.file.path) ?? props.file.language
})
const mediaSource = computed(() => {
  if (!props.file || (previewType.value !== 'image' && previewType.value !== 'video')) {
    return ''
  }

  return sourceForMedia(props.file)
})

function getPreviewType(file?: WorkspaceFile): PreviewType {
  if (!file) {
    return 'unsupported'
  }

  const extension = extensionForPath(file.path)

  if (imageMimeTypes[extension]) {
    return 'image'
  }

  if (videoMimeTypes[extension]) {
    return 'video'
  }

  return binaryExtensions.has(extension) ? 'unsupported' : 'text'
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

  return imageMimeTypes[extension] ?? videoMimeTypes[extension] ?? 'text/plain'
}

function extensionForPath(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? ''
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

const binaryExtensions = new Set([
  '7z',
  'bz2',
  'dmg',
  'doc',
  'docx',
  'exe',
  'gz',
  'pdf',
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
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ui-border-color-light);
  border-radius: 8px;
}

.file-preview-dialog__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid var(--ui-border-color-light);
  background: var(--ui-fill-color-light);
  padding: 8px 10px;
}

.file-preview-dialog__meta span {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-preview-dialog__meta small {
  color: var(--ui-text-color-secondary);
}

.file-preview-dialog__text {
  min-height: 0;
  flex: 1;
  margin: 0;
  overflow: auto;
  padding: 12px;
}

.file-preview-dialog__text code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
}

.file-preview-dialog__media {
  display: grid;
  min-height: 0;
  flex: 1;
  place-items: center;
  overflow: auto;
  background: var(--ui-fill-color-lighter);
  padding: 12px;
}

.file-preview-dialog__media img,
.file-preview-dialog__media video {
  display: block;
  max-width: 100%;
  max-height: 60vh;
  border-radius: 6px;
}
</style>
