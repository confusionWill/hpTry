<template>
  <section class="chat-panel" :class="{ 'chat-panel--collapsed': collapsed }">
    <div class="chat-panel__header">
      <div v-if="!collapsed">
        <h1>{{ conversationTitle }}</h1>
        <p v-if="store.selectedProject">
          {{ store.selectedProject.name }}
        </p>
      </div>
      <UiButton
        :aria-label="
          collapsed ? t('conversation.panel.expand') : t('conversation.panel.collapse')
        "
        circle
        text
        class="chat-panel__collapse"
        :disabled="isTransitioning"
        @click="toggleCollapsed"
      >
        <template #icon>
          <ChevronLeft v-if="collapsed" :size="18" />
          <ChevronRight v-else :size="18" />
        </template>
      </UiButton>
    </div>

    <div v-if="!collapsed && !canChat" class="empty-state">
      <UiEmpty :description="t('conversation.selectEmpty')" />
    </div>

    <template v-else-if="canChat">
      <div v-show="collapsed" class="chat-panel__avatar-list">
        <span
          v-for="bubble in collapsedConversationBubbles"
          :key="bubble.id"
          class="message-avatar"
          :class="`message-avatar--${bubble.type}`"
          :style="avatarTransitionStyle(bubble.id)"
          aria-hidden="true"
        />
      </div>

      <div v-show="!collapsed" class="chat-panel__body">
        <div class="chat-panel__conversation">
          <div
            ref="messagesRef"
            class="messages"
            @scroll="handleMessagesScroll"
          >
            <template v-for="bubble in conversationBubbles" :key="bubble.id">
              <div
                v-if="bubble.type === 'user'"
                class="message-row message-row--user"
              >
                <article class="message" :class="`message--${bubble.message.role}`">
                  <MarkdownPreview :content="bubble.message.content" />
                </article>
                <span
                  class="message-avatar message-avatar--user"
                  :style="avatarTransitionStyle(bubble.id)"
                  aria-hidden="true"
                />
              </div>

              <div v-else class="message-row message-row--assistant">
                <span
                  class="message-avatar message-avatar--assistant"
                  :style="avatarTransitionStyle(bubble.id)"
                  aria-hidden="true"
                />
                <article class="message message--assistant">
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
                    <MarkdownPreview
                      :content="bubble.message.content"
                      :streaming="isStreamingAssistantMessage(bubble.message)"
                    />
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
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
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

const props = defineProps<{
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggleCollapsed: []
}>()

const store = useAgentStore()
const { t } = useI18n()
const isTransitioning = ref(false)
const messagesRef = ref<HTMLElement | null>(null)
const shouldStickToBottom = ref(true)
const lastMessagesScrollTop = ref(0)

const canChat = computed(() => Boolean(store.selectedConversationId || store.isDraftConversationActive))
const conversationBubbles = computed<ConversationBubble[]>(() => {
  const bubbles: ConversationBubble[] = []
  let currentAssistantBubble: Extract<ConversationBubble, { type: 'assistant' }> | undefined

  for (const event of store.events) {
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
const collapsedConversationBubbles = computed(() => conversationBubbles.value.slice(-8))
const conversationTitle = computed(() => {
  if (store.selectedConversation) {
    return store.selectedConversation.title
  }

  if (store.isDraftConversationActive) {
    return t('conversation.new')
  }

  return t('conversation.selectEmpty')
})
const latestEvent = computed(() => store.events.at(-1))

function handleMessagesScroll() {
  const messages = messagesRef.value

  if (!messages) {
    return
  }

  const isScrollingUp = messages.scrollTop < lastMessagesScrollTop.value - 1
  const bottomDistance = messages.scrollHeight - messages.scrollTop - messages.clientHeight

  if (isScrollingUp) {
    shouldStickToBottom.value = false
  } else if (bottomDistance <= 1) {
    shouldStickToBottom.value = true
  }

  lastMessagesScrollTop.value = messages.scrollTop
}

async function scrollMessagesToBottom(force = false) {
  await nextTick()

  const messages = messagesRef.value

  if (!messages || (!force && !shouldStickToBottom.value)) {
    return
  }

  messages.scrollTop = messages.scrollHeight
  lastMessagesScrollTop.value = messages.scrollTop
}

watch(
  latestEvent,
  (event) => {
    const force = event?.type === 'message' && event.role === 'user'

    if (force) {
      shouldStickToBottom.value = true
    }

    void scrollMessagesToBottom(force)
  },
  { flush: 'post' },
)

watch(
  () => [store.selectedConversationId, store.draftConversationProjectId],
  () => {
    shouldStickToBottom.value = true
    void scrollMessagesToBottom(true)
  },
  { flush: 'post' },
)

watch(
  () => props.collapsed,
  (collapsed) => {
    if (!collapsed) {
      void scrollMessagesToBottom()
    }
  },
  { flush: 'post' },
)

onMounted(() => {
  void scrollMessagesToBottom(true)
})

function isStreamingAssistantMessage(message: ConversationMessageEvent): boolean {
  return (
    message.role === 'assistant' &&
    message.responseDurationMs === undefined &&
    latestEvent.value?.id === message.id &&
    store.isConversationRunning(message.conversationId)
  )
}

function avatarTransitionStyle(bubbleId: string): Record<string, string> {
  if (bubbleId !== conversationBubbles.value.at(-1)?.id) {
    return {}
  }

  return {
    viewTransitionName: `conversation-avatar-${bubbleId.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
  }
}

async function toggleCollapsed() {
  if (isTransitioning.value) {
    return
  }

  const updateCollapsedState = async () => {
    emit('toggleCollapsed')
    await nextTick()
  }

  if (!document.startViewTransition) {
    await updateCollapsedState()
    return
  }

  isTransitioning.value = true
  document.documentElement.classList.add('hero-view-transition')

  try {
    const transition = document.startViewTransition(updateCollapsedState)
    await transition.finished.catch(() => undefined)
  } finally {
    document.documentElement.classList.remove('hero-view-transition')
    isTransitioning.value = false
  }
}

function formatAnswerDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  return `${(durationMs / 1000).toFixed(1)}s`
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
    case 'search_files': {
      const matches =
        getNumber(outputRecord ?? {}, 'totalMatches') ??
        (Array.isArray(outputRecord?.matches) ? outputRecord.matches.length : undefined)
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
    case 'replace_in_file': {
      const path = getString(inputRecord ?? {}, 'path') || getString(outputRecord ?? {}, 'path')
      const replacements = getNumber(outputRecord ?? {}, 'replacements')

      if (path && replacements !== undefined) {
        return t('conversation.toolSummary.replaceInFileWithCount', { path, count: replacements })
      }

      return path
        ? t('conversation.toolSummary.replaceInFile', { path })
        : t('conversation.toolSummary.replaceInFileFallback')
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
    case 'delete_directory': {
      const path = getString(inputRecord ?? {}, 'path') || getString(outputRecord ?? {}, 'path')
      return path
        ? t('conversation.toolSummary.deleteDirectory', { path })
        : t('conversation.toolSummary.deleteDirectoryFallback')
    }
    case 'rename_directory': {
      const fromPath = getString(inputRecord ?? {}, 'fromPath') || getString(outputRecord ?? {}, 'fromPath')
      const toPath = getString(inputRecord ?? {}, 'toPath') || getString(outputRecord ?? {}, 'toPath')
      return fromPath && toPath
        ? t('conversation.toolSummary.renameDirectory', { fromPath, toPath })
        : t('conversation.toolSummary.renameDirectoryFallback')
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
  view-transition-name: chat-panel-shell;
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

.chat-panel__collapse {
  flex: 0 0 auto;
  color: var(--ui-text-color-secondary);
  view-transition-name: chat-panel-toggle;
}

.chat-panel--collapsed .chat-panel__header {
  justify-content: center;
  padding-inline: 8px;
}

.chat-panel__avatar-list {
  display: flex;
  min-height: 0;
  align-items: center;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  justify-content: safe center;
  overflow-y: auto;
  padding: 18px;
}

.chat-panel__avatar-list,
.chat-panel__body,
.empty-state {
  animation: chat-panel-content-enter 260ms ease-out both;
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
  overscroll-behavior: contain;
  padding: 18px;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.message-row--user {
  justify-content: flex-end;
}

.message-row--assistant {
  justify-content: flex-start;
}

.message-avatar {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 50%;
}

.message-avatar--user {
  background: #9ca3af;
}

.message-avatar--assistant {
  background: #22c55e;
}

@keyframes chat-panel-content-enter {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-panel__avatar-list,
  .chat-panel__body,
  .empty-state {
    animation: none;
  }
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
