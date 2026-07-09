<template>
  <div
    v-if="canChat"
    class="agent-composer"
    :class="{ 'agent-composer--dragging': isDraggingFiles }"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent="handleDragOver"
    @dragleave="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <input
      ref="fileInputRef"
      class="agent-composer__file-input"
      type="file"
      multiple
      :aria-label="t('conversation.upload.selectFiles')"
      @change="handleFileInputChange"
    />
    <div class="agent-composer__main">
      <UiTextarea
        v-model="draft"
        autosize
        :disabled="isUploadingFiles"
        :min-rows="2"
        :max-rows="6"
        :placeholder="t('conversation.inputPlaceholder')"
        @keydown.enter.exact.prevent="send"
      />
      <div v-if="uploadedAssets.length > 0" class="agent-composer__assets">
        <article v-for="asset in uploadedAssets" :key="asset.path" class="uploaded-asset">
          <span class="uploaded-asset__name">{{ asset.name }}</span>
          <span class="uploaded-asset__path">{{ asset.path }}</span>
          <UiButton
            circle
            text
            class="uploaded-asset__remove"
            :aria-label="t('conversation.upload.removeFile', { name: asset.name })"
            @click="removeUploadedAsset(asset.path)"
          >
            <template #icon>
              <X :size="14" />
            </template>
          </UiButton>
        </article>
      </div>
    </div>
    <UiButton
      circle
      :disabled="currentProjectRunning || isUploadingFiles"
      :aria-label="t('conversation.upload.selectFiles')"
      @click="openFilePicker"
    >
      <template #icon>
        <Paperclip :size="16" />
      </template>
    </UiButton>
    <UiButton
      :danger="currentProjectRunning"
      :disabled="(!draft.trim() && uploadedAssets.length === 0) || isUploadingFiles"
      :loading="isUploadingFiles"
      variant="primary"
      @click="handleComposerAction"
    >
      <template #icon>
        <Square v-if="currentProjectRunning" :size="14" />
        <Send v-else :size="16" />
      </template>
      {{ currentProjectRunning ? t('conversation.stop') : t('conversation.send') }}
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { Paperclip, Send, Square, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { AGENT_SYSTEM_PROMPT, CONVERSATION_TITLE_PROMPT } from '@/services/agent/prompts'
import { ChatCompletionRequestError } from '@/services/openai'
import { useAgentStore } from '@/stores/agent'
import { useUiStore } from '@/stores/ui'

interface UploadedAsset {
  name: string
  path: string
  bytes: number
}

const MAX_TEXT_UPLOAD_BYTES = 120_000

const store = useAgentStore()
const uiStore = useUiStore()
const { t } = useI18n()
const draft = ref('')
const uploadedAssets = ref<UploadedAsset[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDraggingFiles = ref(false)
const isUploadingFiles = ref(false)
let dragDepth = 0

const canChat = computed(() => Boolean(store.selectedConversationId || store.isDraftConversationActive))
const currentProjectRunning = computed(() => store.isSelectedProjectRunning)

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  return `${(bytes / 1024).toFixed(1)} KB`
}

function openFilePicker() {
  fileInputRef.value?.click()
}

function handleDragEnter(event: DragEvent) {
  if (!hasDraggedFiles(event)) {
    return
  }

  dragDepth += 1
  isDraggingFiles.value = true
}

function handleDragOver(event: DragEvent) {
  if (!hasDraggedFiles(event)) {
    return
  }

  event.dataTransfer!.dropEffect = 'copy'
}

function handleDragLeave(event: DragEvent) {
  if (!hasDraggedFiles(event)) {
    return
  }

  dragDepth = Math.max(0, dragDepth - 1)
  isDraggingFiles.value = dragDepth > 0
}

function handleDrop(event: DragEvent) {
  dragDepth = 0
  isDraggingFiles.value = false

  const files = Array.from(event.dataTransfer?.files ?? [])
  void uploadFiles(files)
}

function handleFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  void uploadFiles(files)
}

function hasDraggedFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function removeUploadedAsset(path: string) {
  uploadedAssets.value = uploadedAssets.value.filter((asset) => asset.path !== path)
}

async function uploadFiles(files: File[]) {
  if (files.length === 0 || isUploadingFiles.value) {
    return
  }

  if (!store.selectedProjectId) {
    uiStore.showToast(t('conversation.upload.missingProject'), 'warning')
    return
  }

  isUploadingFiles.value = true

  try {
    const existingPaths = new Set([
      ...store.workspaceFiles.map((file) => file.path),
      ...uploadedAssets.value.map((asset) => asset.path),
    ])
    const payloads = await Promise.all(
      files.map(async (file) => {
        const path = uniqueUploadPath(file.name, existingPaths)
        existingPaths.add(path)

        if (shouldUploadAsText(file)) {
          return {
            path,
            content: await file.text(),
          }
        }

        return {
          path,
          blob: file,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
        }
      }),
    )
    const workspaceFiles = await store.uploadFilesToSelectedWorkspace(payloads)
    const uploaded = workspaceFiles.map((file, index) => ({
      name: files[index]?.name ?? file.path.split('/').pop() ?? file.path,
      path: file.path,
      bytes: files[index]?.size ?? file.size ?? 0,
    }))

    uploadedAssets.value = [...uploadedAssets.value, ...uploaded]
    uiStore.showToast(t('conversation.upload.uploaded', { count: uploaded.length }), 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : t('conversation.upload.failed')
    uiStore.showToast(message || t('conversation.upload.failed'), 'error')
  } finally {
    isUploadingFiles.value = false
  }
}

function shouldUploadAsText(file: File): boolean {
  return file.size <= MAX_TEXT_UPLOAD_BYTES && isTextUpload(file)
}

function isTextUpload(file: File): boolean {
  const mimeType = file.type.toLowerCase()

  if (mimeType.startsWith('text/')) {
    return true
  }

  if (
    [
      'application/json',
      'application/javascript',
      'application/typescript',
      'application/xml',
      'image/svg+xml',
    ].includes(mimeType)
  ) {
    return true
  }

  return textUploadExtensions.has(extensionForFileName(file.name))
}

function extensionForFileName(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

const textUploadExtensions = new Set([
  'cjs',
  'csv',
  'css',
  'env',
  'htm',
  'html',
  'js',
  'json',
  'jsx',
  'md',
  'mjs',
  'svg',
  'toml',
  'ts',
  'tsx',
  'txt',
  'vue',
  'xml',
  'yaml',
  'yml',
])

function uniqueUploadPath(fileName: string, existingPaths: Set<string>): string {
  const safeName = normalizeUploadFileName(fileName)
  const extensionIndex = safeName.lastIndexOf('.')
  const baseName = extensionIndex > 0 ? safeName.slice(0, extensionIndex) : safeName
  const extension = extensionIndex > 0 ? safeName.slice(extensionIndex) : ''
  let path = `assets/uploads/${safeName}`
  let suffix = 2

  while (existingPaths.has(path)) {
    path = `assets/uploads/${baseName}-${suffix}${extension}`
    suffix += 1
  }

  return path
}

function normalizeUploadFileName(fileName: string): string {
  const normalized = fileName
    .replace(/[/\\\0]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized || normalized === '.' || normalized === '..') {
    return 'asset'
  }

  return normalized.slice(0, 120)
}

function buildMessageContent(content: string): string {
  if (uploadedAssets.value.length === 0) {
    return content
  }

  const assetLines = uploadedAssets.value.map(
    (asset) => `- ${asset.path} (${asset.name}, ${formatBytes(asset.bytes)})`,
  )
  const assetBlock = [
    t('conversation.upload.messageHeading'),
    ...assetLines,
    t('conversation.upload.messageInstruction'),
  ].join('\n')

  return content ? `${content}\n\n${assetBlock}` : assetBlock
}

async function send() {
  const content = buildMessageContent(draft.value.trim())

  if (!content || currentProjectRunning.value || isUploadingFiles.value) {
    return
  }

  if (!store.selectedProvider) {
    uiStore.showToast(t('provider.missing'), 'warning')
    return
  }

  draft.value = ''
  uploadedAssets.value = []

  try {
    await store.sendMessage(
      content,
      AGENT_SYSTEM_PROMPT,
      t('agent.emptyFinalMessage'),
      CONVERSATION_TITLE_PROMPT,
      t('conversation.new'),
    )
  } catch (error) {
    if (error instanceof ChatCompletionRequestError) {
      uiStore.showToast(
        error.code === 'timeout' ? t('provider.requestTimeout') : t('conversation.stopped'),
        error.code === 'timeout' ? 'error' : 'info',
      )
      return
    }

    const message = error instanceof Error ? error.message : t('provider.requestFailed')
    uiStore.showToast(message || t('provider.requestFailed'), 'error')
  }
}

function handleComposerAction() {
  if (currentProjectRunning.value) {
    store.stopSelectedProjectRun()
    return
  }

  void send()
}
</script>

<style scoped>
.agent-composer {
  display: grid;
  align-items: end;
  gap: 10px;
  border-top: 1px solid var(--ui-border-color-light);
  background: var(--ui-bg-color);
  grid-template-columns: minmax(0, 1fr) auto auto;
  padding: 14px 18px;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.agent-composer--dragging {
  background: var(--ui-color-primary-light-9);
  box-shadow: inset 0 0 0 2px var(--ui-color-primary-light-5);
}

.agent-composer__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.agent-composer__main {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.agent-composer__assets {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.uploaded-asset {
  display: inline-grid;
  min-width: 0;
  max-width: min(360px, 100%);
  align-items: center;
  column-gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
  border: 1px solid var(--ui-border-color-light);
  border-radius: 7px;
  background: var(--ui-fill-color-light);
  padding: 6px 6px 6px 10px;
}

.uploaded-asset__name,
.uploaded-asset__path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.uploaded-asset__name {
  color: var(--ui-text-color-primary);
  font-size: 12px;
  font-weight: 650;
}

.uploaded-asset__path {
  color: var(--ui-text-color-secondary);
  font-size: 11px;
}

.uploaded-asset__remove {
  grid-row: 1 / span 2;
  grid-column: 2;
  width: 26px;
  min-width: 26px;
  height: 26px;
}
</style>
