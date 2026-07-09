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
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { Code2, Eye } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import MarkdownPreview from '@/components/MarkdownPreview.vue'
import { useAgentStore } from '@/stores/agent'
import type { ConversationMessageEvent, ConversationToolEvent } from '@/types/agent'

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
const { t } = useI18n()
const sourceMessageIds = ref<Set<string>>(new Set())

const canChat = computed(() => Boolean(store.selectedConversationId || store.isDraftConversationActive))
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
    case 'search_files': {
      const matches = Array.isArray(outputRecord?.matches) ? outputRecord.matches.length : undefined
      return matches === undefined
        ? t('conversation.toolSummary.searchFiles')
        : t('conversation.toolSummary.searchFilesWithCount', { count: matches })
    }
    case 'read_files': {
      const files = Array.isArray(outputRecord?.files) ? outputRecord.files.length : undefined
      return files === undefined
        ? t('conversation.toolSummary.readFiles')
        : t('conversation.toolSummary.readFilesWithCount', { count: files })
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
    case 'edit_file': {
      const path = getString(inputRecord ?? {}, 'path') || getString(outputRecord ?? {}, 'path')
      const bytes = getNumber(outputRecord ?? {}, 'bytes')

      if (path && bytes !== undefined) {
        return t('conversation.toolSummary.editFileWithBytes', {
          path,
          bytes: formatBytes(bytes),
        })
      }

      return path
        ? t('conversation.toolSummary.editFile', { path })
        : t('conversation.toolSummary.editFileFallback')
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

</style>
