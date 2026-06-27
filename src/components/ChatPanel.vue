<template>
  <section class="chat-panel">
    <div class="chat-panel__header">
      <div>
        <h1>{{ store.selectedConversation?.title ?? t('conversation.selectEmpty') }}</h1>
        <p v-if="store.selectedProject">
          {{ store.selectedProject.name }}
        </p>
      </div>
      <div class="chat-panel__tools">
        <el-select
          v-model="selectedProviderId"
          class="provider-select"
          :placeholder="t('provider.selectPlaceholder')"
        >
          <el-option
            v-for="provider in store.providers"
            :key="provider.id"
            :label="provider.name"
            :value="provider.id"
          />
        </el-select>
        <el-button :icon="Setting" @click="$emit('openProviders')">
          {{ t('provider.manage') }}
        </el-button>
      </div>
    </div>

    <div v-if="!store.selectedConversationId" class="empty-state">
      <el-empty :description="t('conversation.selectEmpty')" />
    </div>

    <template v-else>
      <div class="messages">
        <article
          v-for="message in store.messages"
          :key="message.id"
          class="message"
          :class="`message--${message.role}`"
        >
          <strong>{{ t(`message.${message.role}`) }}</strong>
          <p>{{ message.content }}</p>
        </article>
      </div>

      <div class="composer">
        <el-input
          v-model="draft"
          :autosize="{ minRows: 2, maxRows: 6 }"
          :placeholder="t('conversation.inputPlaceholder')"
          resize="none"
          type="textarea"
          @keydown.enter.exact.prevent="send"
        />
        <el-button
          :disabled="!draft.trim() || store.sending"
          :icon="Promotion"
          :loading="store.sending"
          type="primary"
          @click="send"
        >
          {{ store.sending ? t('conversation.sending') : t('conversation.send') }}
        </el-button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { Promotion, Setting } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAgentStore } from '@/stores/agent'

defineEmits<{
  openProviders: []
}>()

const store = useAgentStore()
const { t } = useI18n()
const draft = ref('')

const selectedProviderId = computed({
  get: () => store.selectedProviderId,
  set: (value: string) => {
    store.selectedProviderId = value
  },
})

async function send() {
  const content = draft.value.trim()

  if (!content || store.sending) {
    return
  }

  if (!store.selectedProvider) {
    ElMessage.warning(t('provider.missing'))
    return
  }

  draft.value = ''

  try {
    await store.sendMessage(content, t('agent.systemPrompt'))
  } catch (error) {
    const message = error instanceof Error ? error.message : t('provider.requestFailed')
    ElMessage.error(message || t('provider.requestFailed'))
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
  background: var(--el-bg-color);
}

.chat-panel__header {
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  padding: 14px 18px;
}

.chat-panel__header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
}

.chat-panel__header p {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.chat-panel__tools {
  display: flex;
  align-items: center;
  gap: 10px;
}

.provider-select {
  width: 190px;
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
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  padding: 12px 14px;
}

.message--user {
  align-self: flex-end;
  border-color: var(--el-color-primary-light-7);
  background: var(--el-color-primary-light-9);
}

.message strong {
  display: block;
  margin-bottom: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.message p {
  margin: 0;
  line-height: 1.65;
  white-space: pre-wrap;
}

.composer {
  display: grid;
  align-items: end;
  gap: 10px;
  border-top: 1px solid var(--el-border-color-light);
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 14px 18px;
}
</style>
