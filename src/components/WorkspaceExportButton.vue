<template>
  <UiButton
    :disabled="store.workspaceFiles.length === 0"
    :loading="store.exportingHp"
    :aria-label="t('workspace.exportHp')"
    circle
    @click="exportHp"
  >
    <template #icon>
      <Download :size="16" />
    </template>
  </UiButton>
</template>

<script setup lang="ts">
import { Download } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import { useAgentStore } from '@/stores/agent'
import { useUiStore } from '@/stores/ui'

const store = useAgentStore()
const uiStore = useUiStore()
const { t } = useI18n()

async function exportHp() {
  try {
    await store.exportCurrentWorkspaceHp()
  } catch (error) {
    const message = error instanceof Error ? error.message : t('workspace.exportFailed')
    uiStore.showToast(message || t('workspace.exportFailed'), 'error')
  }
}
</script>
