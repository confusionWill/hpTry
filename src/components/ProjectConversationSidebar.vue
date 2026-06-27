<template>
  <aside class="sidebar">
    <div class="section">
      <div class="section__header">
        <h2>{{ t('project.title') }}</h2>
        <el-button :icon="Plus" circle @click="projectDialogVisible = true" />
      </div>

      <el-select
        v-model="selectedProjectId"
        class="project-select"
        :placeholder="t('project.selectPlaceholder')"
        @change="handleProjectChange"
      >
        <el-option
          v-for="project in store.projects"
          :key="project.id"
          :label="project.name"
          :value="project.id"
        />
      </el-select>

      <p v-if="store.selectedProject?.description" class="project-description">
        {{ store.selectedProject.description }}
      </p>
    </div>

    <div class="section conversations">
      <div class="section__header">
        <h2>{{ t('conversation.title') }}</h2>
        <el-button
          :disabled="!store.selectedProjectId"
          :icon="ChatLineRound"
          circle
          @click="conversationDialogVisible = true"
        />
      </div>

      <el-empty
        v-if="store.conversations.length === 0"
        :description="t('conversation.empty')"
        :image-size="80"
      />

      <div v-else class="conversation-list">
        <button
          v-for="conversation in store.conversations"
          :key="conversation.id"
          class="conversation-item"
          :class="{ 'conversation-item--active': conversation.id === store.selectedConversationId }"
          type="button"
          @click="store.selectConversation(conversation.id)"
        >
          <span>{{ conversation.title }}</span>
          <el-button
            :aria-label="t('common.delete')"
            :icon="Delete"
            text
            @click.stop="confirmDeleteConversation(conversation.id)"
          />
        </button>
      </div>
    </div>

    <el-dialog v-model="projectDialogVisible" :title="t('project.create')" width="420px">
      <el-form label-position="top" @submit.prevent>
        <el-form-item :label="t('common.name')" required>
          <el-input v-model="projectForm.name" :placeholder="t('project.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('common.description')">
          <el-input
            v-model="projectForm.description"
            :placeholder="t('project.descriptionPlaceholder')"
            type="textarea"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="projectDialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button :disabled="!projectForm.name.trim()" type="primary" @click="createProject">
          {{ t('common.create') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="conversationDialogVisible" :title="t('conversation.new')" width="420px">
      <el-form label-position="top" @submit.prevent>
        <el-form-item :label="t('common.name')" required>
          <el-input
            v-model="conversationTitle"
            :placeholder="t('conversation.namePlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="conversationDialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button :disabled="!conversationTitle.trim()" type="primary" @click="createConversation">
          {{ t('common.create') }}
        </el-button>
      </template>
    </el-dialog>
  </aside>
</template>

<script setup lang="ts">
import { ChatLineRound, Delete, Plus } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAgentStore } from '@/stores/agent'

const store = useAgentStore()
const { t } = useI18n()

const projectDialogVisible = ref(false)
const conversationDialogVisible = ref(false)
const conversationTitle = ref('')
const projectForm = reactive({
  name: '',
  description: '',
})

const selectedProjectId = computed({
  get: () => store.selectedProjectId,
  set: (value: string) => {
    store.selectedProjectId = value
  },
})

async function handleProjectChange(projectId: string) {
  await store.selectProject(projectId)
}

async function createProject() {
  await store.createProject({
    name: projectForm.name,
    description: projectForm.description,
  })
  projectForm.name = ''
  projectForm.description = ''
  projectDialogVisible.value = false
}

async function createConversation() {
  if (!store.selectedProjectId) {
    return
  }

  await store.createConversation({
    projectId: store.selectedProjectId,
    title: conversationTitle.value,
  })
  conversationTitle.value = ''
  conversationDialogVisible.value = false
}

async function confirmDeleteConversation(conversationId: string) {
  await ElMessageBox.confirm(t('conversation.deleteConfirm'), t('common.delete'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning',
  })
  await store.deleteConversation(conversationId)
}
</script>

<style scoped>
.sidebar {
  display: flex;
  width: 300px;
  min-width: 300px;
  height: 100%;
  flex-direction: column;
  gap: 16px;
  border-right: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  padding: 16px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section__header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.project-select {
  width: 100%;
}

.project-description {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.conversations {
  min-height: 0;
  flex: 1;
}

.conversation-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
}

.conversation-item {
  display: grid;
  width: 100%;
  min-height: 40px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--el-text-color-primary);
  cursor: pointer;
  grid-template-columns: 1fr auto;
  padding: 6px 4px 6px 10px;
  text-align: left;
}

.conversation-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-item:hover,
.conversation-item--active {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-color-primary-light-9);
}
</style>
