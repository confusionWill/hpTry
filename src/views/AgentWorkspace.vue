<template>
  <main class="workspace">
    <ProjectConversationSidebar @open-providers="providerDialogVisible = true" />

    <section v-if="store.projects.length === 0 && !store.loading" class="project-empty">
      <UiEmpty :description="t('project.emptyTitle')">
        <p>{{ t('project.emptyDescription') }}</p>
      </UiEmpty>
    </section>

    <template v-else>
      <ChatPanel />
    </template>

    <ProviderManager v-model="providerDialogVisible" />
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatPanel from '@/components/ChatPanel.vue'
import ProjectConversationSidebar from '@/components/ProjectConversationSidebar.vue'
import ProviderManager from '@/components/ProviderManager.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import { useAgentStore } from '@/stores/agent'

const store = useAgentStore()
const { t } = useI18n()
const providerDialogVisible = ref(false)

onMounted(() => {
  void store.load()
})
</script>

<style scoped>
.workspace {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.project-empty {
  display: grid;
  flex: 1;
  place-items: center;
}

.project-empty p {
  margin: 8px 0 0;
  color: var(--ui-text-color-secondary);
}

@media (max-width: 1100px) {
  .workspace {
    overflow: auto;
  }
}
</style>
