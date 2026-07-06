<template>
  <aside class="workspace-panel">
    <section class="workspace-panel__files">
      <div class="workspace-panel__section-title">
        <span>{{ t('workspace.files') }}</span>
        <span>{{ t('workspace.fileCount', { count: store.workspaceFiles.length }) }}</span>
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
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiEmpty from '@/components/ui/UiEmpty.vue'
import WorkspaceFilePreviewDialog from '@/components/WorkspaceFilePreviewDialog.vue'
import WorkspaceFileTree from '@/components/WorkspaceFileTree.vue'
import { useAgentStore } from '@/stores/agent'

const store = useAgentStore()
const { t } = useI18n()

const previewVisible = ref(false)

function previewWorkspaceFile(path: string) {
  store.selectWorkspaceFile(path)
  previewVisible.value = true
}
</script>

<style scoped>
.workspace-panel {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 100%;
  flex-direction: column;
  border-top: 1px solid var(--ui-border-color-light);
  background: var(--ui-bg-color);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  font-weight: 650;
}

.workspace-panel__section-title span:last-child {
  font-weight: 500;
}

@media (max-width: 1180px) {
  .workspace-panel {
    width: 100%;
    min-width: 0;
  }
}
</style>
