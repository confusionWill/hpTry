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
    <div class="agent-composer__controls">
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
      <div class="agent-composer__main">
        <div v-if="currentProjectAssets.length > 0" class="agent-composer__assets">
          <article v-for="asset in currentProjectAssets" :key="asset.path" class="uploaded-asset">
            <span class="uploaded-asset__path" :title="asset.path">{{ asset.path }}</span>
            <UiButton
              circle
              text
              class="uploaded-asset__remove"
              :aria-label="t('conversation.upload.removeFile', { name: fileNameForPath(asset.path) })"
              :disabled="isUploadingFiles"
              @click="removeUploadedAsset(asset)"
            >
              <template #icon>
                <X :size="14" />
              </template>
            </UiButton>
          </article>
        </div>
        <UiTextarea
          ref="textareaRef"
          v-model="draft"
          autosize
          class="agent-composer__input"
          :aria-label="t('conversation.inputAriaLabel')"
          :disabled="isUploadingFiles"
          :min-rows="2"
          :max-rows="6"
          @keydown="handleComposerKeydown"
        />
      </div>
      <UiButton
        circle
        :danger="currentProjectRunning"
        :disabled="composerActionDisabled"
        :loading="isUploadingFiles"
        variant="primary"
        :aria-label="composerActionLabel"
        @click="handleComposerAction"
      >
        <template #icon>
          <Square
            v-if="currentProjectRunning"
            class="agent-composer__stop-icon"
            :class="{ 'agent-composer__stop-icon--stopping': currentProjectStopping }"
            :size="14"
          />
          <ArrowUp v-else :size="17" :stroke-width="2.4" />
        </template>
      </UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowUp, Paperclip, Square, X } from '@lucide/vue'
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { AGENT_SYSTEM_PROMPT, CONVERSATION_TITLE_PROMPT } from '@/services/agent/prompts'
import {
  CHAT_COMPLETION_RESPONSE_ERROR_I18N_KEYS,
  ChatCompletionRequestError,
  ChatCompletionResponseError,
} from '@/services/openai'
import { useAgentStore } from '@/stores/agent'
import { useUiStore } from '@/stores/ui'
import { formatBytes } from '@/utils/format'

interface UploadedAsset {
  path: string
  bytes: number
  projectId: string
}

const MAX_TEXT_UPLOAD_BYTES = 120_000

const store = useAgentStore()
const uiStore = useUiStore()
const { n, t } = useI18n()
const draft = ref('')
const uploadedAssets = ref<UploadedAsset[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<InstanceType<typeof UiTextarea> | null>(null)
const isDraggingFiles = ref(false)
const isUploadingFiles = ref(false)
let dragDepth = 0

const canChat = computed(() => Boolean(store.selectedConversationId || store.isDraftConversationActive))
const currentProjectRunning = computed(() => store.isSelectedProjectRunning)
const currentProjectStopping = computed(() => store.isSelectedProjectStopping)
const currentProjectAssets = computed(() =>
  uploadedAssets.value.filter((asset) => asset.projectId === store.selectedProjectId),
)
const composerActionDisabled = computed(() => {
  if (isUploadingFiles.value) {
    return true
  }

  if (currentProjectStopping.value) {
    return true
  }

  if (currentProjectRunning.value) {
    return false
  }

  return !draft.value.trim() && currentProjectAssets.value.length === 0
})
const composerActionLabel = computed(() => {
  if (currentProjectStopping.value) {
    return t('conversation.stopping')
  }

  return currentProjectRunning.value ? t('conversation.stop') : t('conversation.send')
})

function fileNameForPath(path: string): string {
  return path.split('/').pop() ?? path
}

function openFilePicker() {
  fileInputRef.value?.click()
}

function focusComposer() {
  if (!canChat.value || isUploadingFiles.value) {
    return
  }

  textareaRef.value?.focus()
}

defineExpose({
  focusComposer,
})

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

async function removeUploadedAsset(asset: UploadedAsset) {
  if (isUploadingFiles.value) {
    return
  }

  isUploadingFiles.value = true

  try {
    const files =
      store.selectedProjectId === asset.projectId ? [...store.workspaceFiles] : []
    await store.deleteWorkspaceFile(asset.projectId, files, asset.path)
    uploadedAssets.value = uploadedAssets.value.filter(
      (item) => item.projectId !== asset.projectId || item.path !== asset.path,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : t('conversation.upload.removeFailed')
    uiStore.showToast(message || t('conversation.upload.removeFailed'), 'error')
  } finally {
    isUploadingFiles.value = false
  }
}

async function uploadFiles(files: File[]) {
  if (files.length === 0 || isUploadingFiles.value) {
    return
  }

  if (!store.selectedProjectId) {
    uiStore.showToast(t('conversation.upload.missingProject'), 'warning')
    return
  }

  const projectId = store.selectedProjectId
  isUploadingFiles.value = true

  try {
    const existingPaths = new Set([
      ...store.workspaceFiles.map((file) => file.path),
      ...uploadedAssets.value
        .filter((asset) => asset.projectId === projectId)
        .map((asset) => asset.path),
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
    const workspaceFiles = await store.uploadFilesToWorkspace(projectId, payloads)
    const uploaded = workspaceFiles.map((file, index) => ({
      path: file.path,
      bytes: files[index]?.size ?? file.size ?? 0,
      projectId,
    }))

    uploadedAssets.value = [...uploadedAssets.value, ...uploaded]
    if (store.selectedProjectId === projectId) {
      uiStore.showToast(t('conversation.upload.uploaded', uploaded.length), 'success')
    }
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
  let path = `.tmp/${safeName}`
  let suffix = 2

  while (existingPaths.has(path)) {
    path = `.tmp/${baseName}-${suffix}${extension}`
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
  if (currentProjectAssets.value.length === 0) {
    return content
  }

  const assetLines = currentProjectAssets.value.map(
    (asset) => `- ${asset.path} (${formatBytes(asset.bytes, n)})`,
  )
  const assetBlock = [
    t('conversation.upload.messageHeading'),
    ...assetLines,
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
  uploadedAssets.value = uploadedAssets.value.filter(
    (asset) => asset.projectId !== store.selectedProjectId,
  )

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

    if (error instanceof ChatCompletionResponseError) {
      uiStore.showToast(t(CHAT_COMPLETION_RESPONSE_ERROR_I18N_KEYS[error.code]), 'error')
      return
    }

    const message = error instanceof Error ? error.message : t('provider.requestFailed')
    uiStore.showToast(message || t('provider.requestFailed'), 'error')
  }
}

function handleComposerKeydown(event: KeyboardEvent) {
  const isEnter =
    event.key === 'Enter' || event.key === 'NumpadEnter' || event.code === 'NumpadEnter'

  if (!isEnter || event.isComposing) {
    return
  }

  if (event.shiftKey) {
    event.preventDefault()
    insertComposerLineBreak(event)
    return
  }

  event.preventDefault()
  void send()
}

function insertComposerLineBreak(event: KeyboardEvent) {
  const textarea = event.target as HTMLTextAreaElement
  const selectionStart = textarea.selectionStart ?? draft.value.length
  const selectionEnd = textarea.selectionEnd ?? selectionStart
  const nextCursorPosition = selectionStart + 1

  draft.value = `${draft.value.slice(0, selectionStart)}\n${draft.value.slice(selectionEnd)}`
  void nextTick(() => {
    textarea.setSelectionRange(nextCursorPosition, nextCursorPosition)
  })
}

function handleComposerAction() {
  if (currentProjectStopping.value) {
    return
  }

  if (currentProjectRunning.value) {
    store.stopSelectedProjectRun()
    return
  }

  void send()
}
</script>

<style scoped>
.agent-composer {
  padding: 14px 18px;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.agent-composer__controls {
  display: grid;
  width: min(100%, 820px);
  align-items: end;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  margin: 0 auto;
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
  gap: 6px;
  border-radius: 10px 10px 0 0;
  background: #fffefb;
  margin-bottom: -14px;
  box-shadow: 0 1px 5px rgb(15 23 42 / 12%);
}

:deep(.ui-textarea.agent-composer__input) {
  border: 0;
  background: transparent;
  color: #4e4e4e;
  font-weight: 400;
}

:deep(.ui-textarea.agent-composer__input:focus) {
  border-color: transparent;
}

.agent-composer__assets {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px 0;
}

.agent-composer__stop-icon--stopping {
  animation: agent-composer-stop-bounce 0.8s ease-in-out infinite;
}

@keyframes agent-composer-stop-bounce {
  0%,
  100% {
    transform: translateY(2px);
  }

  50% {
    transform: translateY(-2px);
  }
}

.uploaded-asset {
  display: inline-grid;
  min-width: 0;
  max-width: 100%;
  flex: 0 1 auto;
  align-items: center;
  column-gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
  border: 0;
  border-radius: 7px;
  background: var(--ui-fill-color-light);
  padding: 6px 6px 6px 10px;
}

.uploaded-asset__path {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.uploaded-asset__remove {
  grid-column: 2;
  width: 26px;
  min-width: 26px;
  height: 26px;
  min-height: 26px;
}
</style>
