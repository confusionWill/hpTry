<template>
  <aside class="workspace-panel" :class="{ 'workspace-panel--expanded': filesExpanded }">
    <section class="workspace-panel__files">
      <button
        class="workspace-panel__section-title"
        type="button"
        :aria-expanded="filesExpanded"
        @click="filesExpanded = !filesExpanded"
      >
        <span class="workspace-panel__section-name">
          <ChevronDown v-if="filesExpanded" :size="14" />
          <ChevronRight v-else :size="14" />
          <span>{{ t('workspace.files') }}</span>
        </span>
        <span>{{ t('workspace.fileCount', { count: store.workspaceFiles.length }) }}</span>
      </button>
      <UiEmpty
        v-if="filesExpanded && store.workspaceFiles.length === 0"
        :description="t('workspace.emptyFiles')"
        :image-size="52"
      />
      <WorkspaceFileTree
        v-else-if="filesExpanded"
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
import { ChevronDown, ChevronRight } from '@lucide/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiEmpty from '@/components/ui/UiEmpty.vue'
import WorkspaceFilePreviewDialog from '@/components/WorkspaceFilePreviewDialog.vue'
import WorkspaceFileTree from '@/components/WorkspaceFileTree.vue'
import { useAgentStore } from '@/stores/agent'

const store = useAgentStore()
const { t } = useI18n()

const filesExpanded = ref(false)
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
  height: auto;
  flex-direction: column;
  border-top: 1px solid var(--ui-border-color-light);
  background: var(--ui-bg-color);
}

.workspace-panel--expanded {
  min-height: 220px;
  max-height: 42vh;
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
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  background: transparent;
  color: var(--ui-text-color-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  padding: 0;
  text-align: left;
}

.workspace-panel__section-title span:last-child {
  font-weight: 500;
}

.workspace-panel__section-title:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--ui-color-primary-light-5);
  outline-offset: 3px;
}

.workspace-panel__section-name {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
}

.workspace-panel__section-name svg {
  flex: 0 0 auto;
}

@media (max-width: 1180px) {
  .workspace-panel {
    width: 100%;
    min-width: 0;
  }
}
</style>
