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
      <div
        v-show="collapsed"
        class="chat-panel__avatar-list"
        :style="{
          '--last-avatar-offset': `${Math.max(collapsedAvatarCount, 1) * 20 - 30}px`,
        }"
      >
        <TransitionGroup
          name="collapsed-avatar"
          tag="div"
          class="chat-panel__avatar-stack"
        >
          <span
            v-for="(bubble, index) in collapsedConversationBubbles"
            :key="bubble.id"
            class="message-avatar"
            :class="
              isCollapsedPacmanBubble(bubble, index)
                ? 'message-avatar--pacman'
                : `message-avatar--${bubble.type}`
            "
            :style="avatarTransitionStyle(bubble.id)"
            aria-hidden="true"
          >
            <template v-if="isCollapsedPacmanBubble(bubble, index)">
              <span class="message-avatar__pacman-half message-avatar__pacman-half--top" />
              <span class="message-avatar__pacman-half message-avatar__pacman-half--bottom" />
            </template>
          </span>
        </TransitionGroup>

        <div
          v-if="showCollapsedAgentActivity"
          class="chat-panel__tool-stream"
          role="status"
          :aria-label="
            t(
              store.isSelectedConversationRunning
                ? 'conversation.agentRunning'
                : 'conversation.finishingToolAnimation',
            )
          "
        >
          <span
            v-for="tool in activeToolAnimations"
            :key="tool.event.id"
            class="chat-panel__floating-tool"
            :style="toolAnimationStyle(tool.lane)"
            aria-hidden="true"
            @animationend.self="handleToolAnimationEnd(tool.event.id)"
          >
            <ToolEventIcon :tool-name="tool.event.toolName" :status="tool.event.status" />
          </span>
        </div>
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
                      :class="{
                        'message-avatar--assistant-loading': isLoadingAssistantBubble(bubble),
                      }"
                      :style="avatarTransitionStyle(bubble.id)"
                      aria-hidden="true"
                    />
                    <button
                      v-if="bubble.tools.length > 0"
                      class="message__tools-toggle"
                      type="button"
                      :aria-label="t('conversation.toolGroup', bubble.tools.length)"
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
                  <div v-if="bubble.events.length > 0" class="message__event-list">
                    <div
                      v-for="event in bubble.events"
                      v-show="
                        event.type === 'message' || isToolGroupExpanded(bubble.id)
                      "
                      :key="event.id"
                      class="message__event"
                      :class="`message__event--${event.type}`"
                    >
                      <MarkdownPreview
                        v-if="assistantEventContent(event)"
                        class="message__event-content"
                        :content="assistantEventContent(event)"
                        :streaming="
                          event.type === 'message' && isStreamingAssistantMessage(event)
                        "
                      />
                      <button
                        v-if="event.type === 'tool'"
                        class="tool-event"
                        :class="`tool-event--${event.status}`"
                        type="button"
                        :aria-label="toolEventLabel(event)"
                        @click="openToolDetail(event)"
                      >
                        <ToolEventIcon
                          :tool-name="event.toolName"
                          :status="event.status"
                        />
                        <span class="tool-event__summary">
                          {{ summarizeToolEvent(event) }}
                        </span>
                      </button>
                    </div>
                  </div>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import MarkdownPreview from '@/components/MarkdownPreview.vue'
import ToolCallDetailDialog from '@/components/ToolCallDetailDialog.vue'
import ToolEventIcon from '@/components/ToolEventIcon.vue'
import { useAgentStore } from '@/stores/agent'
import type {
  ConversationEvent,
  ConversationMessageEvent,
  ConversationToolEvent,
} from '@/types/agent'
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
      turnId: string
      tools: ConversationToolEvent[]
      events: Array<ConversationMessageEvent | ConversationToolEvent>
      message?: ConversationMessageEvent
    }

interface ToolAnimationItem {
  event: ConversationToolEvent
  lane: number
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
const pendingToolAnimations = ref<ToolAnimationItem[]>([])
const activeToolAnimations = ref<ToolAnimationItem[]>([])
const observedToolIds = new Set<string>()
let toolLaunchTimer: ReturnType<typeof setTimeout> | undefined
let lastToolLaunchAt = 0
let nextToolLane = 0

const TOOL_LAUNCH_GAP_MS = 300
const MAX_COLLAPSED_AVATARS = 8

const canChat = computed(() => Boolean(store.selectedConversationId || store.isDraftConversationActive))
const conversationBubbles = computed<ConversationBubble[]>(() => {
  const bubbles: ConversationBubble[] = []
  let currentAssistantBubble: Extract<ConversationBubble, { type: 'assistant' }> | undefined
  let currentAssistantGroupIndex = 0
  let currentTurnId = ''

  for (const event of store.events) {
    if (event.turnId !== currentTurnId) {
      currentTurnId = event.turnId
      currentAssistantBubble = undefined
      currentAssistantGroupIndex = 0
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
        id: `assistant:${event.turnId}:${currentAssistantGroupIndex}`,
        type: 'assistant',
        turnId: event.turnId,
        tools: [],
        events: [],
      }
      currentAssistantGroupIndex += 1
      bubbles.push(currentAssistantBubble)
    }

    if (event.type === 'tool') {
      currentAssistantBubble.tools.push(event)
      currentAssistantBubble.events.push(event)
      continue
    }

    currentAssistantBubble.events.push(event)
    currentAssistantBubble.message = event
    currentAssistantBubble = undefined
  }

  const lastBubble = bubbles.at(-1)

  if (store.isSelectedConversationRunning && lastBubble?.type === 'user') {
    bubbles.push({
      id: `assistant:${lastBubble.message.turnId}:0`,
      type: 'assistant',
      turnId: lastBubble.message.turnId,
      tools: [],
      events: [],
    })
  }

  return bubbles
})
const selectedRunningTurn = computed(() =>
  [...store.turns]
    .reverse()
    .find(
      (turn) =>
        turn.status === 'running' &&
        turn.conversationId === store.selectedConversationId,
    ),
)
const runningTurnTools = computed<ConversationToolEvent[]>(() => {
  const runningTurn = selectedRunningTurn.value

  if (!runningTurn) {
    return []
  }

  return store.events
    .filter(
      (event): event is ConversationToolEvent =>
        event.type === 'tool' && event.turnId === runningTurn.id,
    )
})
const showCollapsedAgentActivity = computed(
  () =>
    store.isSelectedConversationRunning ||
    pendingToolAnimations.value.length > 0 ||
    activeToolAnimations.value.length > 0,
)
const collapsedConversationBubbles = computed(() =>
  conversationBubbles.value.slice(-MAX_COLLAPSED_AVATARS),
)
const collapsedAvatarCount = computed(() => collapsedConversationBubbles.value.length)
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

function assistantEventContent(event: ConversationEvent): string {
  return event.type === 'tool' ? (event.assistantContent ?? '') : event.content
}

function isToolGroupExpanded(bubbleId: string): boolean {
  const runningTurn = selectedRunningTurn.value
  const bubble = conversationBubbles.value.find((item) => item.id === bubbleId)

  if (
    runningTurn &&
    bubble?.type === 'assistant' &&
    bubble.turnId === runningTurn.id
  ) {
    return true
  }

  return expandedToolGroups.value[bubbleId] ?? false
}

function toggleToolGroup(bubbleId: string) {
  const runningTurn = selectedRunningTurn.value
  const bubble = conversationBubbles.value.find((item) => item.id === bubbleId)

  if (
    runningTurn &&
    bubble?.type === 'assistant' &&
    bubble.turnId === runningTurn.id
  ) {
    return
  }

  expandedToolGroups.value = {
    ...expandedToolGroups.value,
    [bubbleId]: !isToolGroupExpanded(bubbleId),
  }
}

function isLoadingAssistantBubble(
  bubble: Extract<ConversationBubble, { type: 'assistant' }>,
): boolean {
  const runningTurn = selectedRunningTurn.value
  const lastBubble = conversationBubbles.value.at(-1)

  return (
    store.isSelectedConversationRunning &&
    runningTurn !== undefined &&
    bubble.turnId === runningTurn.id &&
    lastBubble?.id === bubble.id
  )
}

function isCollapsedPacmanBubble(bubble: ConversationBubble, index: number): boolean {
  if (
    !showCollapsedAgentActivity.value ||
    index !== collapsedConversationBubbles.value.length - 1
  ) {
    return false
  }

  if (bubble.type !== 'assistant') {
    return true
  }

  if (selectedRunningTurn.value) {
    return bubble.turnId === selectedRunningTurn.value.id
  }

  return pendingToolAnimations.value.length > 0 || activeToolAnimations.value.length > 0
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

watch(
  () => store.selectedConversationId,
  () => {
    resetToolAnimationPresentation()
    observeCurrentRunningTools()
  },
  { flush: 'sync', immediate: true },
)

watch(
  () => props.collapsed,
  () => {
    resetToolAnimationPresentation()
    observeCurrentRunningTools()
  },
  { flush: 'sync' },
)

watch(
  runningTurnTools,
  (tools) => {
    for (const tool of tools) {
      const existingItem = [...pendingToolAnimations.value, ...activeToolAnimations.value].find(
        (item) => item.event.id === tool.id,
      )

      if (existingItem) {
        existingItem.event = tool
        continue
      }

      if (observedToolIds.has(tool.id)) {
        continue
      }

      observedToolIds.add(tool.id)

      if (!props.collapsed || !store.isSelectedConversationRunning) {
        continue
      }

      pendingToolAnimations.value.push({
        event: tool,
        lane: nextToolLane,
      })
      nextToolLane += 1
    }

    scheduleNextToolAnimation()
  },
  { deep: true },
)

onMounted(() => {
  void scrollMessagesToBottom(true)
})

onBeforeUnmount(() => {
  clearToolLaunchTimer()
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

function toolAnimationStyle(lane: number): Record<string, string> {
  const horizontalOffsets = ['-13px', '11px', '-9px', '14px']

  return {
    '--tool-x': horizontalOffsets[lane % horizontalOffsets.length] ?? '0px',
  }
}

function resetToolAnimationPresentation() {
  clearToolLaunchTimer()
  pendingToolAnimations.value = []
  activeToolAnimations.value = []
  observedToolIds.clear()
  lastToolLaunchAt = 0
  nextToolLane = 0
}

function observeCurrentRunningTools() {
  for (const tool of runningTurnTools.value) {
    observedToolIds.add(tool.id)
  }
}

function clearToolLaunchTimer() {
  if (toolLaunchTimer === undefined) {
    return
  }

  clearTimeout(toolLaunchTimer)
  toolLaunchTimer = undefined
}

function launchNextToolAnimation() {
  toolLaunchTimer = undefined

  const nextTool = pendingToolAnimations.value.shift()

  if (!nextTool) {
    return
  }

  activeToolAnimations.value.push(nextTool)
  lastToolLaunchAt = Date.now()
  scheduleNextToolAnimation()
}

function scheduleNextToolAnimation() {
  if (
    !props.collapsed ||
    toolLaunchTimer !== undefined ||
    pendingToolAnimations.value.length === 0
  ) {
    return
  }

  const elapsedSinceLastLaunch = Date.now() - lastToolLaunchAt
  const delay =
    lastToolLaunchAt === 0
      ? 0
      : Math.max(0, TOOL_LAUNCH_GAP_MS - elapsedSinceLastLaunch)

  if (delay === 0) {
    launchNextToolAnimation()
    return
  }

  toolLaunchTimer = setTimeout(launchNextToolAnimation, delay)
}

function handleToolAnimationEnd(toolId: string) {
  activeToolAnimations.value = activeToolAnimations.value.filter(
    (item) => item.event.id !== toolId,
  )
  scheduleNextToolAnimation()
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
  view-transition-name: chat-panel-toggle;
}

.chat-panel__collapse:hover:not(:disabled) {
  border-color: #1f2937;
  background: #1f2937;
  color: var(--ui-color-white);
}

.chat-panel__avatar-list {
  position: relative;
  display: flex;
  min-height: 0;
  align-items: center;
  flex: 1;
  flex-direction: column;
  justify-content: safe center;
  overflow: hidden;
  padding: 18px;
}

.chat-panel__avatar-stack {
  position: relative;
  display: flex;
  width: 28px;
  align-items: center;
  flex-direction: column;
  gap: 12px;
}

.collapsed-avatar-enter-active,
.collapsed-avatar-leave-active,
.collapsed-avatar-move {
  transition:
    opacity 260ms ease,
    scale 260ms ease,
    translate 420ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.collapsed-avatar-enter-from {
  opacity: 0;
  scale: 0.72;
  translate: 0 40px;
}

.collapsed-avatar-leave-to {
  opacity: 0;
  scale: 0.72;
  translate: 0 -40px;
}

.collapsed-avatar-leave-active {
  position: absolute;
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

.message-avatar--pacman {
  position: relative;
  z-index: 2;
  width: 28px;
  height: 28px;
  flex-basis: 28px;
  border-radius: 0;
  background: transparent;
  filter: drop-shadow(0 4px 7px rgb(34 197 94 / 22%));
  transform: rotate(90deg);
}

.message-avatar__pacman-half {
  position: absolute;
  left: -3px;
  width: 34px;
  height: 17px;
  background: #22c55e;
}

.message-avatar__pacman-half--top {
  top: -3px;
  border-radius: 34px 34px 0 0;
  animation: pacman-chomp-top 440ms ease-in-out infinite;
  transform-origin: 50% 100%;
}

.message-avatar__pacman-half--bottom {
  bottom: -3px;
  border-radius: 0 0 34px 34px;
  animation: pacman-chomp-bottom 440ms ease-in-out infinite;
  transform-origin: 50% 0;
}

.chat-panel__tool-stream {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.chat-panel__floating-tool {
  position: absolute;
  top: calc(100% + 12px);
  left: calc(50% - 10px);
  display: grid;
  width: 20px;
  height: 20px;
  color: var(--ui-text-color-secondary);
  opacity: 0;
  place-items: center;
  transform: translateX(var(--tool-x));
  animation: tool-float-to-last-avatar 3s linear both;
}

.chat-panel__floating-tool :deep(.tool-event-icon) {
  width: 16px;
  height: 16px;
}

@keyframes pacman-chomp-top {
  0%,
  100% {
    transform: rotate(-4deg);
  }

  50% {
    transform: rotate(-34deg);
  }
}

@keyframes pacman-chomp-bottom {
  0%,
  100% {
    transform: rotate(4deg);
  }

  50% {
    transform: rotate(34deg);
  }
}

@keyframes tool-float-to-last-avatar {
  0% {
    top: calc(100% + 12px);
    opacity: 0;
    transform: translate(var(--tool-x), 8px) scale(0.72);
  }

  14% {
    opacity: 0.82;
  }

  99.9% {
    top: calc(50% + var(--last-avatar-offset));
    opacity: 0.82;
    transform: translate(0, 0) scale(1);
  }

  100% {
    top: calc(50% + var(--last-avatar-offset));
    opacity: 0;
    transform: translate(0, 0) scale(1);
  }
}

.message-avatar--assistant-meta {
  width: 20px;
  height: 20px;
  flex-basis: 20px;
}

.message-avatar--assistant-loading {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.message-avatar--assistant-loading::before,
.message-avatar--assistant-loading::after {
  position: absolute;
  border-radius: 50%;
  content: '';
  inset: 0;
  transform: scale(0);
  transform-origin: center;
}

.message-avatar--assistant-loading::before {
  z-index: 1;
  background: var(--ui-color-white);
  animation: assistant-avatar-fill-white 1.8s linear infinite;
}

.message-avatar--assistant-loading::after {
  z-index: 2;
  background: #22c55e;
  animation: assistant-avatar-fill-green 1.8s linear infinite;
}

@keyframes assistant-avatar-fill-white {
  0% {
    transform: scale(0);
  }

  45%,
  100% {
    transform: scale(1);
  }
}

@keyframes assistant-avatar-fill-green {
  0%,
  50% {
    transform: scale(0);
  }

  95%,
  100% {
    transform: scale(1);
  }
}

.message-avatar--in-bubble {
  position: absolute;
  z-index: 1;
  top: -8px;
  width: 20px;
  height: 20px;
}

.message--assistant {
  width: 100%;
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

  .collapsed-avatar-enter-active,
  .collapsed-avatar-leave-active,
  .collapsed-avatar-move {
    transition: none;
  }

  .chat-panel__floating-tool {
    animation-duration: 1ms;
  }

  .message-avatar--pacman {
    transform: rotate(90deg);
  }

  .message-avatar__pacman-half {
    animation: none;
  }

  .message-avatar--assistant-loading::before,
  .message-avatar--assistant-loading::after {
    animation: none;
  }

  .message-avatar__pacman-half--top {
    transform: rotate(-22deg);
  }

  .message-avatar__pacman-half--bottom {
    transform: rotate(22deg);
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

.message__event-list {
  display: grid;
  gap: 2px;
}

.message__event {
  min-width: 0;
}

.message__event-content {
  padding: 4px 0 2px;
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
