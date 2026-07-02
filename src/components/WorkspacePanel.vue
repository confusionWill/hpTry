<template>
  <aside class="workspace-panel">
    <header class="workspace-panel__header">
      <div>
        <h2>{{ t('workspace.title') }}</h2>
        <p>{{ t('workspace.fileCount', { count: store.workspaceFiles.length }) }}</p>
      </div>
      <UiButton
        :disabled="store.workspaceFiles.length === 0"
        :loading="store.exportingZip"
        @click="exportZip"
      >
        <template #icon>
          <Download :size="16" />
        </template>
        {{ t('workspace.exportZip') }}
      </UiButton>
    </header>

    <section class="workspace-panel__files">
      <div class="workspace-panel__section-title">
        {{ t('workspace.files') }}
      </div>
      <UiEmpty
        v-if="store.workspaceFiles.length === 0"
        :description="t('workspace.emptyFiles')"
        :image-size="52"
      />
      <WorkspaceFileTree
        v-else
        :files="store.workspaceFiles"
        :selected-path="store.selectedWorkspaceFilePath"
        @select="previewWorkspaceFile"
      />
    </section>

    <WorkspaceFilePreviewDialog
      v-model="previewVisible"
      :file="store.selectedWorkspaceFile"
    />
  </aside>
</template>

<script setup lang="ts">
import { Download } from '@lucide/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import WorkspaceFilePreviewDialog from '@/components/WorkspaceFilePreviewDialog.vue'
import WorkspaceFileTree from '@/components/WorkspaceFileTree.vue'
import { useAgentStore } from '@/stores/agent'
import { useUiStore } from '@/stores/ui'

const store = useAgentStore()
const uiStore = useUiStore()
const { t } = useI18n()

const previewVisible = ref(false)

function previewWorkspaceFile(path: string) {
  store.selectWorkspaceFile(path)
  previewVisible.value = true
}

async function exportZip() {
  try {
    await store.exportCurrentWorkspaceZip()
  } catch (error) {
    const message = error instanceof Error ? error.message : t('workspace.exportFailed')
    uiStore.showToast(message || t('workspace.exportFailed'), 'error')
  }
}
</script>

<style scoped>
.workspace-panel {
  display: flex;
  width: 380px;
  min-width: 380px;
  height: 100%;
  flex-direction: column;
  border-left: 1px solid var(--ui-border-color-light);
  background: var(--ui-bg-color);
}

.workspace-panel__header {
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--ui-border-color-light);
  padding: 14px;
}

.workspace-panel__header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}

.workspace-panel__header p {
  margin: 4px 0 0;
  color: var(--ui-text-color-secondary);
  font-size: 12px;
}

.workspace-panel__files {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.workspace-panel__files {
  flex: 1 1 auto;
}

.workspace-panel__section-title {
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  font-weight: 650;
}

@media (max-width: 1180px) {
  .workspace-panel {
    width: 330px;
    min-width: 330px;
  }
}
</style>
