<template>
  <aside class="workspace-panel" :class="{ 'workspace-panel--expanded': filesExpanded }">
    <section class="workspace-panel__files">
      <div v-if="filesExpanded" class="workspace-panel__content">
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
      </div>

      <button
        class="workspace-panel__section-title"
        type="button"
        :aria-expanded="filesExpanded"
        @click="filesExpanded = !filesExpanded"
      >
        <span class="workspace-panel__section-name">
          <ChevronUp v-if="filesExpanded" :size="14" />
          <ChevronRight v-else :size="14" />
          <span>{{ t('workspace.files') }}</span>
        </span>
        <span>{{ t('workspace.fileCount', { count: store.workspaceFiles.length }) }}</span>
      </button>
    </section>

    <WorkspaceFilePreviewDialog
      v-model="previewVisible"
      :file="store.selectedWorkspaceFile"
    />
  </aside>
</template>

<script setup lang="ts">
import { ChevronRight, ChevronUp } from '@lucide/vue'
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
  position: absolute;
  bottom: 12px;
  left: 50%;
  display: flex;
  width: 168px;
  min-width: 0;
  height: 44px;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ui-border-color-light);
  border-radius: 999px;
  background: var(--ui-bg-color);
  box-shadow: 0 8px 24px rgb(15 23 42 / 12%);
  transform: translateX(-50%);
  transition:
    width 280ms cubic-bezier(0.22, 1, 0.36, 1),
    height 280ms cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 280ms ease,
    box-shadow 280ms ease;
  z-index: 2;
}

.workspace-panel--expanded {
  width: calc(100% - 24px);
  height: min(360px, 46vh);
  border-radius: 18px;
  box-shadow: 0 18px 44px rgb(15 23 42 / 18%);
}

.workspace-panel__files {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: 5px 8px;
}

.workspace-panel--expanded .workspace-panel__files {
  padding: 10px;
}

.workspace-panel__content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 8px;
}

.workspace-panel__content :deep(.file-tree) {
  flex: 1;
}

.workspace-panel__content :deep(.ui-empty) {
  flex: 1;
  place-content: center;
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
  flex: 0 0 32px;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  padding: 0 6px;
  text-align: left;
}

.workspace-panel--expanded .workspace-panel__section-title {
  border-top: 1px solid var(--ui-border-color-light);
  padding-top: 5px;
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
  .workspace-panel--expanded {
    width: calc(100% - 20px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .workspace-panel {
    transition: none;
  }
}
</style>
