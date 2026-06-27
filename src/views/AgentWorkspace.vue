<template>
  <main class="workspace">
    <ProjectConversationSidebar />

    <section v-if="store.projects.length === 0 && !store.loading" class="project-empty">
      <el-empty :description="t('project.emptyTitle')">
        <p>{{ t('project.emptyDescription') }}</p>
      </el-empty>
    </section>

    <template v-else>
      <ChatPanel @open-providers="providerDrawerVisible = true" />
      <aside class="right-panel">
        <FileManager />
      </aside>
    </template>

    <ProviderManager v-model="providerDrawerVisible" />
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatPanel from '@/components/ChatPanel.vue'
import FileManager from '@/components/FileManager.vue'
import ProjectConversationSidebar from '@/components/ProjectConversationSidebar.vue'
import ProviderManager from '@/components/ProviderManager.vue'
import { useAgentStore } from '@/stores/agent'

const store = useAgentStore()
const { t } = useI18n()
const providerDrawerVisible = ref(false)

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
  color: var(--el-text-color-secondary);
}

.right-panel {
  display: flex;
  width: 430px;
  min-width: 430px;
  height: 100%;
  border-left: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  padding: 16px;
}

@media (max-width: 1100px) {
  .workspace {
    overflow: auto;
  }

  .right-panel {
    min-width: 360px;
  }
}
</style>
