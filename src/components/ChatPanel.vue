<template>
  <section class="chat-panel">
    <div class="chat-panel__header">
      <div>
        <h1>{{ store.selectedConversation?.title ?? t('conversation.selectEmpty') }}</h1>
        <p v-if="store.selectedProject">
          {{ store.selectedProject.name }}
        </p>
      </div>
    </div>

    <div v-if="!store.selectedConversationId" class="empty-state">
      <UiEmpty :description="t('conversation.selectEmpty')" />
    </div>

    <template v-else>
      <div class="messages">
        <article
          v-for="message in store.messages"
          :key="message.id"
          class="message"
          :class="`message--${message.role}`"
        >
          <p>{{ message.content }}</p>
          <span
            v-if="message.role === 'assistant' && message.responseDurationMs !== undefined"
            class="message__answer-duration"
          >
            {{
              t('conversation.answerDuration', {
                duration: formatAnswerDuration(message.responseDurationMs),
              })
            }}
          </span>
        </article>
      </div>

      <div class="composer">
        <UiTextarea
          v-model="draft"
          autosize
          :min-rows="2"
          :max-rows="6"
          :placeholder="t('conversation.inputPlaceholder')"
          @keydown.enter.exact.prevent="send"
        />
        <UiButton
          :disabled="!draft.trim() || store.sending"
          :loading="store.sending"
          variant="primary"
          @click="send"
        >
          <template #icon>
            <Send :size="16" />
          </template>
          {{ store.sending ? t('conversation.sending') : t('conversation.send') }}
        </UiButton>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { Send } from '@lucide/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { useAgentStore } from '@/stores/agent'
import { useUiStore } from '@/stores/ui'

const store = useAgentStore()
const uiStore = useUiStore()
const { t } = useI18n()
const draft = ref('')

function formatAnswerDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  return `${(durationMs / 1000).toFixed(1)}s`
}

async function send() {
  const content = draft.value.trim()

  if (!content || store.sending) {
    return
  }

  if (!store.selectedProvider) {
    uiStore.showToast(t('provider.missing'), 'warning')
    return
  }

  draft.value = ''

  try {
    await store.sendMessage(content, t('agent.systemPrompt'))
  } catch (error) {
    const message = error instanceof Error ? error.message : t('provider.requestFailed')
    uiStore.showToast(message || t('provider.requestFailed'), 'error')
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

.message p {
  margin: 0;
  line-height: 1.65;
  white-space: pre-wrap;
}

.message__answer-duration {
  display: block;
  margin-top: 8px;
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.composer {
  display: grid;
  align-items: end;
  gap: 10px;
  border-top: 1px solid var(--ui-border-color-light);
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 14px 18px;
}
</style>
