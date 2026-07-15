<template>
  <UiDialog
    v-model="model"
    :aria-label="t('conversation.toolDetail.ariaLabel')"
    :show-header="true"
    :title="tool ? t('conversation.toolCall', { name: tool.toolName }) : ''"
    width="min(760px, 92vw)"
    @closed="emit('closed')"
  >
    <template v-if="tool" #header>
      <div class="tool-detail__title">
        <h2>{{ t('conversation.toolCall', { name: tool.toolName }) }}</h2>
        <strong :class="`tool-detail__status--${tool.status}`">
          {{ t(`workspace.toolStatus.${tool.status}`) }}
        </strong>
      </div>
    </template>

    <div v-if="tool" class="tool-detail">
      <section>
        <h3>{{ t('conversation.toolInput') }}</h3>
        <pre>{{ formatPayload(tool.input) }}</pre>
      </section>
      <section v-if="tool.error">
        <h3>{{ t('conversation.toolError') }}</h3>
        <pre>{{ tool.error }}</pre>
      </section>
      <section v-else-if="tool.output">
        <h3>{{ t('conversation.toolOutput') }}</h3>
        <pre>{{ formatPayload(tool.output) }}</pre>
      </section>
    </div>
  </UiDialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import UiDialog from '@/components/ui/UiDialog.vue'
import type { ConversationToolEvent } from '@/types/agent'

const model = defineModel<boolean>({ required: true })

defineProps<{
  tool?: ConversationToolEvent
}>()

const emit = defineEmits<{
  closed: []
}>()

const { t } = useI18n()

function formatPayload(payload: string): string {
  if (!payload) {
    return ''
  }

  try {
    return JSON.stringify(JSON.parse(payload), null, 2)
  } catch {
    return payload
  }
}
</script>

<style scoped>
.tool-detail {
  display: grid;
  gap: 16px;
}

.tool-detail__title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tool-detail__title h2 {
  margin: 0;
  color: var(--ui-text-color-primary);
  font-size: 16px;
  font-weight: 650;
}

.tool-detail__title strong {
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  font-weight: 650;
}

.tool-detail__status--success {
  color: #15803d;
}

.tool-detail__status--error {
  color: #dc2626;
}

.tool-detail section {
  min-width: 0;
}

.tool-detail h3 {
  margin: 0 0 8px;
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  font-weight: 650;
}

.tool-detail pre {
  overflow: auto;
  max-height: 320px;
  margin: 0;
  border: 1px solid var(--ui-border-color-light);
  border-radius: 8px;
  background: var(--ui-fill-color-blank);
  padding: 12px;
  color: var(--ui-text-color-primary);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre;
}
</style>
