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

    <section class="workspace-panel__tools">
      <div class="workspace-panel__section-title">
        {{ t('workspace.toolRuns') }}
      </div>
      <UiEmpty
        v-if="store.toolRuns.length === 0"
        :description="t('workspace.emptyToolRuns')"
        :image-size="52"
      />
      <div v-else class="tool-list">
        <article
          v-for="run in visibleToolRuns"
          :key="run.id"
          class="tool-run"
          :class="`tool-run--${run.status}`"
        >
          <div class="tool-run__header">
            <span>{{ run.toolName }}</span>
            <small>{{ t(`workspace.toolStatus.${run.status}`) }}</small>
          </div>
          <p>{{ summarizeRun(run) }}</p>
        </article>
      </div>
    </section>

    <WorkspaceFilePreviewDialog
      v-model="previewVisible"
      :file="store.selectedWorkspaceFile"
    />
  </aside>
</template>

<script setup lang="ts">
import { Download } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import WorkspaceFilePreviewDialog from '@/components/WorkspaceFilePreviewDialog.vue'
import WorkspaceFileTree from '@/components/WorkspaceFileTree.vue'
import { useAgentStore } from '@/stores/agent'
import { useUiStore } from '@/stores/ui'
import type { ToolRun } from '@/types/agent'

const store = useAgentStore()
const uiStore = useUiStore()
const { t } = useI18n()

const previewVisible = ref(false)
const visibleToolRuns = computed(() => store.toolRuns.slice(-10).reverse())

function previewWorkspaceFile(path: string) {
  store.selectWorkspaceFile(path)
  previewVisible.value = true
}

function summarizeRun(run: ToolRun): string {
  if (run.error) {
    return run.error
  }

  if (run.output) {
    return run.output.length > 140 ? `${run.output.slice(0, 140)}...` : run.output
  }

  return run.input.length > 140 ? `${run.input.slice(0, 140)}...` : run.input
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

.workspace-panel__files,
.workspace-panel__tools {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid var(--ui-border-color-light);
  padding: 12px;
}

.workspace-panel__files {
  flex: 1 1 auto;
}

.workspace-panel__tools {
  flex: 0 0 190px;
  border-bottom: 0;
}

.workspace-panel__section-title {
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  font-weight: 650;
}

.tool-list {
  min-height: 0;
  overflow: auto;
}

.tool-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-run {
  border: 1px solid var(--ui-border-color-light);
  border-radius: 8px;
  padding: 8px;
}

.tool-run--success {
  border-color: #bbf7d0;
}

.tool-run--error {
  border-color: #fecaca;
}

.tool-run__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tool-run__header span {
  font-size: 12px;
  font-weight: 650;
}

.tool-run__header small {
  color: var(--ui-text-color-secondary);
}

.tool-run p {
  margin: 6px 0 0;
  overflow: hidden;
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

@media (max-width: 1180px) {
  .workspace-panel {
    width: 330px;
    min-width: 330px;
  }
}
</style>
