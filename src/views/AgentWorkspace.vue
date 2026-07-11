<template>
  <main class="workspace" :class="{ 'workspace--chat-collapsed': chatPanelCollapsed }">
    <aside class="workspace__left">
      <ProjectConversationSidebar @open-providers="providerDialogVisible = true" />
      <WorkspacePanel />
    </aside>

    <section v-if="store.projects.length === 0 && !store.loading" class="project-empty">
      <UiEmpty :description="t('project.emptyTitle')">
        <p>{{ t('project.emptyDescription') }}</p>
      </UiEmpty>
    </section>

    <template v-else>
      <section class="workspace__preview">
        <LivePreviewPanel />
        <AgentComposer ref="composerRef" />
      </section>

      <ChatPanel
        :collapsed="chatPanelCollapsed"
        @toggle-collapsed="chatPanelCollapsed = !chatPanelCollapsed"
      />
    </template>

    <ProviderManager v-model="providerDialogVisible" />
  </main>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import AgentComposer from '@/components/AgentComposer.vue'
import ChatPanel from '@/components/ChatPanel.vue'
import LivePreviewPanel from '@/components/LivePreviewPanel.vue'
import ProjectConversationSidebar from '@/components/ProjectConversationSidebar.vue'
import ProviderManager from '@/components/ProviderManager.vue'
import WorkspacePanel from '@/components/WorkspacePanel.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import { useAgentStore } from '@/stores/agent'

const store = useAgentStore()
const { t } = useI18n()
const providerDialogVisible = ref(false)
const chatPanelCollapsed = ref(false)
const composerRef = ref<InstanceType<typeof AgentComposer> | null>(null)

onMounted(() => {
  void store.load().then(focusComposer)
})

function focusComposer() {
  void nextTick(() => {
    composerRef.value?.focusComposer()
  })
}

watch(
  () => [
    store.selectedConversationId,
    store.isDraftConversationActive ? store.draftConversationProjectId : '',
  ],
  focusComposer,
)
</script>

<style scoped>
.workspace {
  display: grid;
  grid-template-columns: 320px minmax(320px, 1fr) minmax(240px, 23vw);
  width: 100%;
  height: 100%;
  overflow: hidden;
  transition: grid-template-columns 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

:global(.hero-view-transition) .workspace {
  transition: none;
}

.workspace--chat-collapsed {
  grid-template-columns: 320px minmax(320px, 1fr) 64px;
}

.workspace__left {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--ui-border-color-light);
  background: var(--ui-bg-color);
  grid-template-rows: minmax(0, 1fr);
}

.workspace__preview {
  display: grid;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--ui-border-color-light);
  background: var(--ui-bg-color);
  grid-template-rows: minmax(0, 1fr) auto;
  view-transition-name: workspace-preview;
}

.project-empty {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-column: 2 / -1;
  place-items: center;
}

.project-empty p {
  margin: 8px 0 0;
  color: var(--ui-text-color-secondary);
}

@media (max-width: 1100px) {
  .workspace {
    grid-template-columns: 320px 420px 240px;
    overflow: auto;
  }

  .workspace--chat-collapsed {
    grid-template-columns: 320px 420px 64px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .workspace {
    transition: none;
  }
}
</style>
