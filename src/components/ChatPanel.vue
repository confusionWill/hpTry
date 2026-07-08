<template>
  <section class="chat-panel">
    <div class="chat-panel__header">
      <div>
        <h1>{{ conversationTitle }}</h1>
        <p v-if="store.selectedProject">
          {{ store.selectedProject.name }}
        </p>
      </div>
    </div>

    <div v-if="!canChat" class="empty-state">
      <UiEmpty :description="t('conversation.selectEmpty')" />
    </div>

    <template v-else>
      <div class="chat-panel__body">
        <div class="chat-panel__conversation">
          <div class="messages">
            <template v-for="bubble in conversationBubbles" :key="bubble.id">
              <article
                v-if="bubble.type === 'user'"
                class="message"
                :class="`message--${bubble.message.role}`"
              >
                <MarkdownPreview :content="bubble.message.content" />
              </article>

              <article v-else class="message message--assistant">
                <div v-if="bubble.message" class="message__actions">
                  <UiButton
                    circle
                    text
                    class="message__toggle"
                    :aria-label="
                      isSourceVisible(bubble.message.id)
                        ? t('conversation.previewMarkdown')
                        : t('conversation.viewMarkdownSource')
                    "
                    @click="toggleSource(bubble.message.id)"
                  >
                    <template #icon>
                      <Eye v-if="isSourceVisible(bubble.message.id)" :size="15" />
                      <Code2 v-else :size="15" />
                    </template>
                  </UiButton>
                </div>

                <details
                  v-if="bubble.tools.length > 0"
                  class="message__tools"
                  :open="hasRunningTool(bubble.tools)"
                >
                  <summary class="message__tools-summary">
                    <span>{{ t('conversation.toolGroup', { count: bubble.tools.length }) }}</span>
                    <span>{{ summarizeToolGroup(bubble.tools) }}</span>
                  </summary>
                  <div class="message__tools-list">
                    <article
                      v-for="tool in bubble.tools"
                      :key="tool.id"
                      class="tool-event"
                      :class="`tool-event--${tool.status}`"
                    >
                      <details class="tool-event__details" :open="tool.status === 'running'">
                        <summary>
                          <span class="tool-event__name">
                            {{ t('conversation.toolCall', { name: tool.toolName }) }}
                          </span>
                          <span class="tool-event__summary">
                            {{ summarizeToolEvent(tool) }}
                          </span>
                          <span class="tool-event__status">
                            {{ t(`workspace.toolStatus.${tool.status}`) }}
                          </span>
                        </summary>
                        <div class="tool-event__body">
                          <section>
                            <h3>{{ t('conversation.toolInput') }}</h3>
                            <pre>{{ formatToolPayload(tool.input) }}</pre>
                          </section>
                          <section v-if="tool.error">
                            <h3>{{ t('conversation.toolError') }}</h3>
                            <pre>{{ tool.error }}</pre>
                          </section>
                          <section v-else-if="tool.output">
                            <h3>{{ t('conversation.toolOutput') }}</h3>
                            <pre>{{ formatToolPayload(tool.output) }}</pre>
                          </section>
                        </div>
                      </details>
                    </article>
                  </div>
                </details>

                <template v-if="bubble.message">
                  <pre
                    v-if="isSourceVisible(bubble.message.id)"
                    class="message__source"
                  >{{ bubble.message.content }}</pre>
                  <MarkdownPreview v-else :content="bubble.message.content" />
                  <span
                    v-if="bubble.message.responseDurationMs !== undefined"
                    class="message__answer-duration"
                  >
                    {{
                      t('conversation.answerDuration', {
                        duration: formatAnswerDuration(bubble.message.responseDurationMs),
                      })
                    }}
                  </span>
                </template>
              </article>
            </template>
          </div>

          <div
            class="composer"
            :class="{ 'composer--dragging': isDraggingFiles }"
            @dragenter.prevent="handleDragEnter"
            @dragover.prevent="handleDragOver"
            @dragleave="handleDragLeave"
            @drop.prevent="handleDrop"
          >
            <input
              ref="fileInputRef"
              class="composer__file-input"
              type="file"
              multiple
              :aria-label="t('conversation.upload.selectFiles')"
              @change="handleFileInputChange"
            />
            <div class="composer__main">
              <UiTextarea
                v-model="draft"
                autosize
                :disabled="isUploadingFiles"
                :min-rows="2"
                :max-rows="6"
                :placeholder="t('conversation.inputPlaceholder')"
                @keydown.enter.exact.prevent="send"
              />
              <div v-if="uploadedAssets.length > 0" class="composer__assets">
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
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { Code2, Eye, Paperclip, Send, Square, X } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import MarkdownPreview from '@/components/MarkdownPreview.vue'
import { AGENT_SYSTEM_PROMPT, CONVERSATION_TITLE_PROMPT } from '@/services/agent/prompts'
import { ChatCompletionRequestError } from '@/services/openai'
import { useAgentStore } from '@/stores/agent'
import { useUiStore } from '@/stores/ui'
import type { ConversationMessageEvent, ConversationToolEvent } from '@/types/agent'

interface UploadedAsset {
  name: string
  path: string
  bytes: number
}

const MAX_TEXT_UPLOAD_BYTES = 120_000

type ConversationBubble =
  | {
      id: string
      type: 'user'
      message: ConversationMessageEvent
    }
  | {
      id: string
      type: 'assistant'
      tools: ConversationToolEvent[]
      message?: ConversationMessageEvent
    }

const store = useAgentStore()
const uiStore = useUiStore()
const { t } = useI18n()
const draft = ref('')
const uploadedAssets = ref<UploadedAsset[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDraggingFiles = ref(false)
const isUploadingFiles = ref(false)
const sourceMessageIds = ref<Set<string>>(new Set())
let dragDepth = 0

const canChat = computed(() => Boolean(store.selectedConversationId || store.isDraftConversationActive))
const currentProjectRunning = computed(() => store.isSelectedProjectRunning)
const conversationBubbles = computed<ConversationBubble[]>(() => {
  const bubbles: ConversationBubble[] = []
  let currentAssistantBubble: Extract<ConversationBubble, { type: 'assistant' }> | undefined

  for (const event of [...store.events].sort((left, right) => left.createdAt - right.createdAt)) {
    if (event.type === 'message' && event.role === 'user') {
      bubbles.push({
        id: event.id,
        type: 'user',
        message: event,
      })
      currentAssistantBubble = undefined
      continue
    }

    if (!currentAssistantBubble) {
      currentAssistantBubble = {
        id: `assistant:${event.id}`,
        type: 'assistant',
        tools: [],
      }
      bubbles.push(currentAssistantBubble)
    }

    if (event.type === 'tool') {
      currentAssistantBubble.tools.push(event)
      continue
    }

    currentAssistantBubble.message = event
    currentAssistantBubble = undefined
  }

  return bubbles
})
const conversationTitle = computed(() => {
  if (store.selectedConversation) {
    return store.selectedConversation.title
  }

  if (store.isDraftConversationActive) {
    return t('conversation.new')
  }

  return t('conversation.selectEmpty')
})

function formatAnswerDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  return `${(durationMs / 1000).toFixed(1)}s`
}

function isSourceVisible(messageId: string): boolean {
  return sourceMessageIds.value.has(messageId)
}

function toggleSource(messageId: string) {
  const nextMessageIds = new Set(sourceMessageIds.value)

  if (nextMessageIds.has(messageId)) {
    nextMessageIds.delete(messageId)
  } else {
    nextMessageIds.add(messageId)
  }

  sourceMessageIds.value = nextMessageIds
}

function formatToolPayload(payload: string): string {
  if (!payload) {
    return ''
  }

  try {
    return JSON.stringify(JSON.parse(payload), null, 2)
  } catch {
    return payload
  }
}

function parseToolPayload(payload: string): unknown {
  if (!payload) {
    return undefined
  }

  try {
    return JSON.parse(payload)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(value: Record<string, unknown>, key: string): string {
  const result = value[key]

  return typeof result === 'string' ? result : ''
}

function getNumber(value: Record<string, unknown>, key: string): number | undefined {
  const result = value[key]

  return typeof result === 'number' ? result : undefined
}

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

function hasRunningTool(tools: ConversationToolEvent[]): boolean {
  return tools.some((tool) => tool.status === 'running')
}

function summarizeToolGroup(tools: ConversationToolEvent[]): string {
  const runningCount = tools.filter((tool) => tool.status === 'running').length
  const errorCount = tools.filter((tool) => tool.status === 'error').length

  if (runningCount > 0) {
    return t('conversation.toolGroupRunning', { count: runningCount })
  }

  if (errorCount > 0) {
    return t('conversation.toolGroupFailed', { count: errorCount })
  }

  return t('conversation.toolGroupCompleted')
}

function summarizeToolEvent(tool: ConversationToolEvent): string {
  if (tool.error) {
    return tool.error
  }

  const input = parseToolPayload(tool.input)
  const output = parseToolPayload(tool.output)
  const inputRecord = isRecord(input) ? input : undefined
  const outputRecord = isRecord(output) ? output : undefined

  switch (tool.toolName) {
    case 'list_files': {
      const files = Array.isArray(outputRecord?.files) ? outputRecord.files.length : undefined
      return files === undefined
        ? t('conversation.toolSummary.listFiles')
        : t('conversation.toolSummary.listFilesWithCount', { count: files })
    }
    case 'read_file': {
      const path = getString(inputRecord ?? {}, 'path') || getString(outputRecord ?? {}, 'path')
      return path
        ? t('conversation.toolSummary.readFile', { path })
        : t('conversation.toolSummary.readFileFallback')
    }
    case 'write_file': {
      const path = getString(inputRecord ?? {}, 'path') || getString(outputRecord ?? {}, 'path')
      const bytes = getNumber(outputRecord ?? {}, 'bytes')

      if (path && bytes !== undefined) {
        return t('conversation.toolSummary.writeFileWithBytes', {
          path,
          bytes: formatBytes(bytes),
        })
      }

      return path
        ? t('conversation.toolSummary.writeFile', { path })
        : t('conversation.toolSummary.writeFileFallback')
    }
    case 'delete_file': {
      const path = getString(inputRecord ?? {}, 'path') || getString(outputRecord ?? {}, 'path')
      return path
        ? t('conversation.toolSummary.deleteFile', { path })
        : t('conversation.toolSummary.deleteFileFallback')
    }
    case 'rename_file': {
      const fromPath =
        getString(inputRecord ?? {}, 'fromPath') || getString(outputRecord ?? {}, 'fromPath')
      const toPath = getString(inputRecord ?? {}, 'toPath') || getString(outputRecord ?? {}, 'toPath')

      return fromPath && toPath
        ? t('conversation.toolSummary.renameFile', { fromPath, toPath })
        : t('conversation.toolSummary.renameFileFallback')
    }
    case 'inspect_project': {
      const files = Array.isArray(outputRecord?.files) ? outputRecord.files.length : undefined
      return files === undefined
        ? t('conversation.toolSummary.inspectProject')
        : t('conversation.toolSummary.inspectProjectWithCount', { count: files })
    }
    default:
      return t('conversation.toolSummary.generic')
  }
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
.chat-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--ui-bg-color);
}

.chat-panel__header {
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--ui-border-color-light);
  padding: 14px 18px;
}

.chat-panel__header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
}

.chat-panel__header p {
  margin: 4px 0 0;
  color: var(--ui-text-color-secondary);
  font-size: 13px;
}

.empty-state {
  display: grid;
  min-height: 0;
  flex: 1;
  place-items: center;
}

.chat-panel__body {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.chat-panel__conversation {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.messages {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding: 18px;
}

.message {
  max-width: min(760px, 86%);
  border: 1px solid var(--ui-border-color-light);
  border-radius: 8px;
  background: var(--ui-fill-color-blank);
  padding: 12px 14px;
}

.message--user {
  align-self: flex-end;
  border-color: var(--ui-color-primary-light-7);
  background: var(--ui-color-primary-light-9);
}

.message__actions {
  display: flex;
  justify-content: flex-end;
  margin: -6px -8px 4px 0;
}

.message__toggle {
  width: 28px;
  min-width: 28px;
  height: 28px;
  color: var(--ui-text-color-secondary);
}

.message__source {
  overflow: auto;
  margin: 0;
  border: 1px solid var(--ui-border-color-light);
  border-radius: 8px;
  background: var(--ui-fill-color-light);
  padding: 10px 12px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
}

.message__tools {
  border: 1px solid var(--ui-border-color-light);
  border-radius: 8px;
  background: var(--ui-bg-color-page);
  margin-bottom: 10px;
}

.message__tools-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  list-style: none;
  padding: 10px 12px;
}

.message__tools-summary::-webkit-details-marker {
  display: none;
}

.message__tools-summary span:first-child {
  flex: 0 0 auto;
  color: var(--ui-text-color-primary);
  font-size: 13px;
  font-weight: 650;
}

.message__tools-summary span:last-child {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message__tools-list {
  display: grid;
  gap: 8px;
  border-top: 1px solid var(--ui-border-color-light);
  padding: 10px;
}

.message__answer-duration {
  display: block;
  margin-top: 8px;
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.tool-event {
  border: 1px solid var(--ui-border-color-light);
  border-radius: 8px;
  background: var(--ui-fill-color-blank);
  color: var(--ui-text-color-secondary);
}

.tool-event--success {
  border-color: #bbf7d0;
}

.tool-event--error {
  border-color: #fecaca;
}

.tool-event__details {
  padding: 10px 12px;
}

.tool-event__details summary {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  list-style: none;
}

.tool-event__details summary::-webkit-details-marker {
  display: none;
}

.tool-event__name {
  flex: 0 0 auto;
  color: var(--ui-text-color-primary);
  font-size: 13px;
  font-weight: 650;
}

.tool-event__summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-event__status {
  flex: 0 0 auto;
  font-size: 12px;
}

.tool-event__body {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.tool-event__body h3 {
  margin: 0 0 6px;
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  font-weight: 650;
}

.tool-event__body pre {
  overflow: auto;
  max-height: 280px;
  margin: 0;
  border: 1px solid var(--ui-border-color-light);
  border-radius: 8px;
  background: var(--ui-fill-color-blank);
  padding: 10px 12px;
  color: var(--ui-text-color-primary);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre;
}

.composer {
  display: grid;
  align-items: end;
  gap: 10px;
  border-top: 1px solid var(--ui-border-color-light);
  grid-template-columns: minmax(0, 1fr) auto auto;
  padding: 14px 18px;
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease;
}

.composer--dragging {
  background: var(--ui-color-primary-light-9);
  box-shadow: inset 0 0 0 2px var(--ui-color-primary-light-5);
}

.composer__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.composer__main {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.composer__assets {
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
