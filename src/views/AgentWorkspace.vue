<template>
  <main class="workspace">
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

      <ChatPanel />
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
}

.workspace__left {
  display: grid;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--ui-border-color-light);
  background: var(--ui-bg-color);
  grid-template-rows: minmax(0, 1fr) auto;
}

.workspace__preview {
  display: grid;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--ui-border-color-light);
  background: var(--ui-bg-color);
  grid-template-rows: minmax(0, 1fr) auto;
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
}
</style>
