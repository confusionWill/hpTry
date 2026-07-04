<template>
  <aside class="sidebar">
    <div class="section">
      <div class="section__header">
        <UiButton
          :aria-label="t('common.settings')"
          circle
          class="provider-entry"
          @click="$emit('openProviders')"
        >
          <template #icon>
            <Settings :size="17" />
          </template>
        </UiButton>
        <UiButton
          :aria-label="t('project.create')"
          circle
          @click="projectDialogVisible = true"
        >
          <template #icon>
            <Plus :size="17" />
          </template>
        </UiButton>
      </div>

      <UiSelect
        v-model="selectedProjectId"
        class="project-select"
        :options="projectOptions"
        :placeholder="t('project.selectPlaceholder')"
        @change="handleProjectChange"
      />

      <p v-if="store.selectedProject?.description" class="project-description">
        {{ store.selectedProject.description }}
      </p>
    </div>

    <div class="section conversations">
      <div class="section__header">
        <h2>{{ t('conversation.title') }}</h2>
        <UiButton
          :disabled="!store.selectedProjectId"
          circle
          @click="store.startDraftConversation()"
        >
          <template #icon>
            <MessageCircle :size="17" />
          </template>
        </UiButton>
      </div>

      <UiEmpty
        v-if="store.conversations.length === 0 && !store.isDraftConversationActive"
        :description="t('conversation.empty')"
        :image-size="80"
      />

      <div v-else class="conversation-list">
        <div
          v-if="store.isDraftConversationActive"
          class="conversation-item conversation-item--active"
        >
          <button class="conversation-item__select" type="button">
            <span>{{ t('conversation.new') }}</span>
          </button>
        </div>
        <div
          v-for="conversation in store.conversations"
          :key="conversation.id"
          class="conversation-item"
          :class="{ 'conversation-item--active': conversation.id === store.selectedConversationId }"
        >
          <UiInput
            v-if="editingConversationId === conversation.id"
            v-model="editingConversationTitle"
            class="conversation-item__input"
            :placeholder="t('conversation.namePlaceholder')"
            @keydown.enter.exact.prevent="saveConversationTitle(conversation.id)"
            @keydown.esc.prevent="cancelEditingConversation"
          />
          <button
            v-else
            class="conversation-item__select"
            type="button"
            @click="store.selectConversation(conversation.id)"
          >
            <span>{{ conversation.title }}</span>
          </button>
          <div class="conversation-item__actions">
            <template v-if="editingConversationId === conversation.id">
              <UiButton
                :aria-label="t('common.save')"
                text
                @click="saveConversationTitle(conversation.id)"
              >
                <template #icon>
                  <Check :size="16" />
                </template>
              </UiButton>
              <UiButton
                :aria-label="t('common.cancel')"
                text
                @click="cancelEditingConversation"
              >
                <template #icon>
                  <X :size="16" />
                </template>
              </UiButton>
            </template>
            <template v-else>
              <UiButton
                :aria-label="t('common.edit')"
                text
                @click="startEditingConversation(conversation.id, conversation.title)"
              >
                <template #icon>
                  <Pencil :size="16" />
                </template>
              </UiButton>
              <UiButton
                :aria-label="t('common.delete')"
                :disabled="store.isConversationRunning(conversation.id)"
                text
                @click="confirmDeleteConversation(conversation.id)"
              >
                <template #icon>
                  <Trash2 :size="16" />
                </template>
              </UiButton>
            </template>
          </div>
        </div>
      </div>
    </div>

    <UiDialog
      v-model="projectDialogVisible"
      :close-label="t('common.close')"
      :title="t('project.create')"
      width="420px"
    >
      <form @submit.prevent="createProject">
        <UiFormItem :label="t('common.name')" required>
          <UiInput v-model="projectForm.name" :placeholder="t('project.namePlaceholder')" />
        </UiFormItem>
        <UiFormItem :label="t('common.description')">
          <UiTextarea
            v-model="projectForm.description"
            :placeholder="t('project.descriptionPlaceholder')"
          />
        </UiFormItem>
      </form>
      <template #footer>
        <UiButton @click="projectDialogVisible = false">
          {{ t('common.cancel') }}
        </UiButton>
        <UiButton :disabled="!projectForm.name.trim()" variant="primary" @click="createProject">
          {{ t('common.create') }}
        </UiButton>
      </template>
    </UiDialog>
  </aside>
</template>

<script setup lang="ts">
import { Check, MessageCircle, Pencil, Plus, Settings, Trash2, X } from '@lucide/vue'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiFormItem from '@/components/ui/UiFormItem.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import UiTextarea from '@/components/ui/UiTextarea.vue'
import { useAgentStore } from '@/stores/agent'
import { useUiStore } from '@/stores/ui'

defineEmits<{
  openProviders: []
}>()

const store = useAgentStore()
const uiStore = useUiStore()
const { t } = useI18n()

const projectDialogVisible = ref(false)
const editingConversationId = ref('')
const editingConversationTitle = ref('')
const projectForm = reactive({
  name: '',
  description: '',
})

const projectOptions = computed<UiSelectOption[]>(() =>
  store.projects.map((project) => ({
    label: store.isProjectRunning(project.id)
      ? `${project.name} · ${t('project.running')}`
      : project.name,
    value: project.id,
  })),
)

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

function startEditingConversation(conversationId: string, title: string) {
  editingConversationId.value = conversationId
  editingConversationTitle.value = title
}

function cancelEditingConversation() {
  editingConversationId.value = ''
  editingConversationTitle.value = ''
}

async function saveConversationTitle(conversationId: string) {
  if (!editingConversationTitle.value.trim()) {
    return
  }

  await store.updateConversationTitle(conversationId, editingConversationTitle.value)
  cancelEditingConversation()
}

async function confirmDeleteConversation(conversationId: string) {
  const confirmed = await uiStore.requestConfirm({
    title: t('common.delete'),
    message: t('conversation.deleteConfirm'),
    confirmText: t('common.confirm'),
    cancelText: t('common.cancel'),
    type: 'warning',
  })

  if (!confirmed) {
    return
  }

  await store.deleteConversation(conversationId)
}
</script>

<style scoped>
.sidebar {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 100%;
  flex-direction: column;
  gap: 16px;
  background: var(--ui-bg-color);
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

.provider-entry {
  min-width: 0;
}

.project-select {
  width: 100%;
}

.project-description {
  margin: 0;
  color: var(--ui-text-color-secondary);
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
  color: var(--ui-text-color-primary);
  grid-template-columns: 1fr auto;
  padding: 6px 4px;
  text-align: left;
}

.conversation-item__input {
  min-width: 0;
}

.conversation-item__select {
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 0 6px;
  text-align: left;
}

.conversation-item__select span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-item__actions {
  display: flex;
  align-items: center;
}

.conversation-item:hover,
.conversation-item--active {
  border-color: var(--ui-color-primary-light-7);
  background: var(--ui-color-primary-light-9);
}
</style>
