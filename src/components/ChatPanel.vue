<template>
  <section class="chat-panel" :class="{ 'chat-panel--collapsed': collapsed }">
    <div class="chat-panel__header">
      <UiButton
        :aria-label="
          collapsed ? t('conversation.panel.expand') : t('conversation.panel.collapse')
        "
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
            <div v-if="store.loadingOlderTurns" class="messages__history-status">
              {{ t('conversation.loadingOlder') }}
            </div>
            <template v-for="bubble in conversationBubbles" :key="bubble.id">
              <div
                v-if="bubble.type === 'user'"
                class="message-row message-row--user"
              >
                <article class="message" :class="`message--${bubble.message.role}`">
                  <span
                    class="message-avatar message-avatar--user message-avatar--in-bubble"
                    :style="avatarTransitionStyle(bubble.id)"
                    aria-hidden="true"
                  />
                  <MarkdownPreview :content="bubble.message.content" />
                </article>
              </div>

              <div v-else class="message-row message-row--assistant">
                <article class="message message--assistant">
                  <div class="message__assistant-meta">
                    <span
                      class="message-avatar message-avatar--assistant message-avatar--assistant-meta"
                      :style="avatarTransitionStyle(bubble.id)"
                      aria-hidden="true"
                    />
                    <button
                      v-if="bubble.tools.length > 0"
                      class="message__tools-toggle"
                      type="button"
                      :aria-label="t('conversation.toolGroup', { count: bubble.tools.length })"
                      :aria-expanded="isToolGroupExpanded(bubble.id)"
                      @click="toggleToolGroup(bubble.id)"
                    >
                      <span
                        class="message__tools-preview"
                        :class="{ 'message__tools-preview--overflow': bubble.tools.length > 3 }"
                      >
                        <ToolEventIcon
                          v-for="tool in bubble.tools.slice(0, 3)"
                          :key="tool.id"
                          :tool-name="tool.toolName"
                          :status="tool.status"
                        />
                      </span>
                      <ChevronRight
                        class="message__tools-chevron"
                        :class="{ 'message__tools-chevron--expanded': isToolGroupExpanded(bubble.id) }"
                        :size="12"
                        aria-hidden="true"
                      />
                    </button>
                    <span
                      v-if="bubble.message?.responseDurationMs !== undefined"
                      class="message__answer-duration"
                    >
                      {{ formatAnswerDuration(bubble.message.responseDurationMs) }}
                    </span>
                  </div>
                  <div
                    v-if="bubble.tools.length > 0 && isToolGroupExpanded(bubble.id)"
                    class="message__tools-list"
                  >
                    <template v-for="tool in bubble.tools" :key="tool.id">
                      <MarkdownPreview
                        v-if="tool.assistantContent"
                        class="tool-event__content"
                        :content="tool.assistantContent"
                      />
                      <button
                        class="tool-event"
                        :class="`tool-event--${tool.status}`"
                        type="button"
                        :aria-label="toolEventLabel(tool)"
                        @click="openToolDetail(tool)"
                      >
                        <ToolEventIcon :tool-name="tool.toolName" :status="tool.status" />
                        <span class="tool-event__summary">
                          {{ summarizeToolEvent(tool) }}
                        </span>
                      </button>
                    </template>
                  </div>

                  <template v-if="bubble.message">
                    <MarkdownPreview
                      :content="bubble.message.content"
                      :streaming="isStreamingAssistantMessage(bubble.message)"
                    />
                  </template>
                </article>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>

    <ToolCallDetailDialog
      v-model="toolDetailVisible"
      :tool="selectedTool"
      @closed="selectedToolId = ''"
    />
  </section>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import MarkdownPreview from '@/components/MarkdownPreview.vue'
import ToolCallDetailDialog from '@/components/ToolCallDetailDialog.vue'
import ToolEventIcon from '@/components/ToolEventIcon.vue'
import { useAgentStore } from '@/stores/agent'
import type { ConversationMessageEvent, ConversationToolEvent } from '@/types/agent'
import { summarizeToolEvent as summarizeTool } from '@/utils/toolPresentation'

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
const selectedToolId = ref('')
const toolDetailVisible = ref(false)
const expandedToolGroups = ref<Record<string, boolean>>({})

const canChat = computed(() => Boolean(store.selectedConversationId || store.isDraftConversationActive))
const conversationBubbles = computed<ConversationBubble[]>(() => {
  const bubbles: ConversationBubble[] = []
  let currentAssistantBubble: Extract<ConversationBubble, { type: 'assistant' }> | undefined
  let currentTurnId = ''

  for (const event of store.events) {
    if (event.turnId !== currentTurnId) {
      currentTurnId = event.turnId
      currentAssistantBubble = undefined
    }

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
const transitioningBubbleIds = computed(
  () => new Set(collapsedConversationBubbles.value.map((bubble) => bubble.id)),
)
const latestEvent = computed(() => store.events.at(-1))
const selectedTool = computed(() => {
  const event = store.events.find((item) => item.id === selectedToolId.value)

  return event?.type === 'tool' ? event : undefined
})

function openToolDetail(tool: ConversationToolEvent) {
  selectedToolId.value = tool.id
  toolDetailVisible.value = true
}

function isToolGroupExpanded(bubbleId: string): boolean {
  return expandedToolGroups.value[bubbleId] ?? false
}

function toggleToolGroup(bubbleId: string) {
  expandedToolGroups.value = {
    ...expandedToolGroups.value,
    [bubbleId]: !isToolGroupExpanded(bubbleId),
  }
}

function handleMessagesScroll() {
  const messages = messagesRef.value

  if (!messages || props.collapsed) {
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

  if (messages.scrollTop <= 80 && store.hasOlderTurns && !store.loadingOlderTurns) {
    void loadOlderMessages()
  }
}

async function loadOlderMessages(fillViewport = false) {
  const messages = messagesRef.value
  const conversationId = store.selectedConversationId

  if (!messages || !conversationId || !store.hasOlderTurns || store.loadingOlderTurns) {
    return
  }

  do {
    const previousScrollHeight = messages.scrollHeight
    const previousScrollTop = messages.scrollTop

    await store.loadOlderConversationTurns()
    await nextTick()

    if (messagesRef.value !== messages || store.selectedConversationId !== conversationId) {
      return
    }

    messages.scrollTop = previousScrollTop + messages.scrollHeight - previousScrollHeight
    lastMessagesScrollTop.value = messages.scrollTop
  } while (
    fillViewport &&
    messages.scrollHeight <= messages.clientHeight &&
    store.hasOlderTurns
  )
}

async function scrollMessagesToBottom(force = false) {
  await nextTick()

  const messages = messagesRef.value

  if (!messages || (!force && !shouldStickToBottom.value)) {
    return
  }

  messages.scrollTop = messages.scrollHeight
  lastMessagesScrollTop.value = messages.scrollTop

  if (!props.collapsed && messages.scrollHeight <= messages.clientHeight && store.hasOlderTurns) {
    await loadOlderMessages(true)
  }
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
  if (!transitioningBubbleIds.value.has(bubbleId)) {
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

    if (!props.collapsed) {
      shouldStickToBottom.value = true
      await scrollMessagesToBottom(true)
    }
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

    if (!props.collapsed) {
      shouldStickToBottom.value = true
      await scrollMessagesToBottom(true)
    }
  }
}

function formatAnswerDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  return `${(durationMs / 1000).toFixed(1)}s`
}

function summarizeToolEvent(tool: ConversationToolEvent): string {
  return summarizeTool(tool, t)
}

function toolEventLabel(tool: ConversationToolEvent): string {
  return t('conversation.toolEventLabel', {
    name: tool.toolName,
    summary: summarizeToolEvent(tool),
    status: t(`workspace.toolStatus.${tool.status}`),
  })
}
</script>

<style scoped>
.chat-panel {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--ui-background2);
  border-left: 1px solid #eee;
}

.chat-panel__header {
  position: absolute;
  z-index: 2;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.chat-panel__collapse {
  width: 34px;
  min-width: 34px;
  height: 34px;
  min-height: 34px;
  flex: 0 0 auto;
  border-color: #374151;
  border-radius: 0;
  background: #374151;
  color: var(--ui-color-white);
  padding: 0;
}

.chat-panel__collapse:hover:not(:disabled) {
  border-color: #1f2937;
  background: #1f2937;
  color: var(--ui-color-white);
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
  view-transition-name: chat-panel-shell;
}

.empty-state {
  display: grid;
  min-height: 0;
  flex: 1;
  place-items: center;
}

.chat-panel__body {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.chat-panel__body::before {
  position: absolute;
  z-index: 1;
  top: 0;
  right: 0;
  left: 0;
  height: 28px;
  background: linear-gradient(to bottom, var(--ui-background2), transparent);
  content: '';
  pointer-events: none;
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
  padding: 68px 18px 40px;
}

.messages__history-status {
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
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

.message-avatar--assistant-meta {
  width: 20px;
  height: 20px;
  flex-basis: 20px;
}

.message-avatar--in-bubble {
  position: absolute;
  z-index: 1;
  top: -8px;
  width: 20px;
  height: 20px;
}

.message--assistant {
  max-width: min(760px, 100%);
  padding: 5px 0 !important;
}

.message--user {
  max-width: min(760px, 90%);
}

.message--user .message-avatar--in-bubble {
  right: -8px;
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
  position: relative;
  border-radius: 8px;
  padding: 10px 12px;
}

.message--user {
  align-self: flex-end;
  background: var(--ui-color-primary-light-9);
}

.message__assistant-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.message__tools-toggle {
  display: flex;
  height: 24px;
  align-items: center;
  gap: 3px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-color-secondary);
  cursor: pointer;
  padding: 2px 4px;
}

.message__tools-toggle:hover {
  background: var(--ui-fill-color-light);
}

.message__tools-toggle:focus-visible {
  outline: 2px solid var(--ui-color-primary);
  outline-offset: 1px;
}

.message__tools-preview {
  display: flex;
  width: fit-content;
  max-width: 52px;
  align-items: center;
  gap: 2px;
}

.message__tools-preview--overflow {
  mask-image: linear-gradient(to right, #000 0%, #000 68%, transparent 100%);
}

.message__tools-chevron {
  flex: 0 0 auto;
  transition: transform 160ms ease;
}

.message__tools-chevron--expanded {
  transform: rotate(90deg);
}

.message__tools-list {
  display: grid;
  gap: 2px;
  margin-bottom: 10px;
}

.tool-event__content {
  padding: 4px 0 2px;
  color: var(--ui-text-color-secondary);
  font-size: 12px;
}

.message__answer-duration {
  margin-left: auto;
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.tool-event {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-color-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 6px 0;
  text-align: left;
}

.tool-event:hover {
  background: var(--ui-fill-color-light);
}

.tool-event:focus-visible {
  outline: 2px solid var(--ui-color-primary);
  outline-offset: 2px;
}

.tool-event__summary {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
