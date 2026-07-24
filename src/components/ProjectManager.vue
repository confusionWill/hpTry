<template>
  <UiDialog
    v-model="visible"
    :title="t('project.manage')"
    width="520px"
    show-header
    @closed="resetCreateForm"
  >
    <div class="project-manager">
      <div v-if="store.projects.length > 0" class="project-list">
        <div
          v-for="project in store.projects"
          :key="project.id"
          class="project-item"
          :class="{ 'project-item--active': project.id === store.selectedProjectId }"
        >
          <div v-if="editingProjectId === project.id" class="project-item__edit">
            <span class="project-item__icon" aria-hidden="true">
              <FolderKanban :size="18" />
            </span>
            <input
              :ref="setRenameInput"
              v-model="editingProjectName"
              :aria-label="t('project.renameAriaLabel', { name: project.name })"
              class="project-item__rename-input"
              type="text"
              @blur="saveProjectName(project.id)"
              @keydown.enter.exact.prevent="saveProjectName(project.id)"
              @keydown.esc.prevent="cancelRenaming"
            />
          </div>
          <template v-else>
            <button class="project-item__select" type="button" @click="selectProject(project.id)">
              <span class="project-item__icon" aria-hidden="true">
                <FolderKanban :size="18" />
              </span>
              <span class="project-item__details">
                <span class="project-item__name">{{ project.name }}</span>
                <span v-if="store.isProjectRunning(project.id)" class="project-item__status">
                  {{ t('project.running') }}
                </span>
              </span>
            </button>
            <UiMoreMenu
              :items="projectMenuItems(project.id)"
              :trigger-label="t('project.actionsAriaLabel', { name: project.name })"
              @select="handleProjectAction(project.id, $event)"
            />
          </template>
        </div>
      </div>

      <UiEmpty v-else :description="t('project.empty')" :image-size="72" />

      <form class="project-create" @submit.prevent="createProject">
        <div class="project-create__heading">
          <Plus :size="17" aria-hidden="true" />
          <span>{{ t('project.create') }}</span>
        </div>
        <div class="project-create__controls">
          <UiInput
            v-model="projectName"
            :aria-label="t('common.name')"
            :placeholder="t('project.namePlaceholder')"
          />
          <UiButton
            :disabled="!projectName.trim()"
            :loading="creating"
            variant="primary"
            @click="createProject"
          >
            {{ t('common.create') }}
          </UiButton>
        </div>
      </form>
    </div>
  </UiDialog>
</template>

<script setup lang="ts">
import { FolderKanban, Pencil, Plus, Trash2 } from '@lucide/vue'
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiMoreMenu, { type UiMoreMenuItem } from '@/components/ui/UiMoreMenu.vue'
import { useAgentStore } from '@/stores/agent'
import { useUiStore } from '@/stores/ui'

const visible = defineModel<boolean>({ required: true })

const store = useAgentStore()
const uiStore = useUiStore()
const { t } = useI18n()
const projectName = ref(t('project.untitled'))
const creating = ref(false)
const editingProjectId = ref('')
const editingProjectName = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

function resetCreateForm() {
  projectName.value = t('project.untitled')
  cancelRenaming()
}

function projectMenuItems(projectId: string): UiMoreMenuItem[] {
  return [
    {
      key: 'rename',
      label: t('common.rename'),
      icon: Pencil,
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: Trash2,
      danger: true,
      disabled: store.isProjectRunning(projectId),
    },
  ]
}

function handleProjectAction(projectId: string, action: string) {
  if (action === 'rename') {
    void startRenaming(projectId)
    return
  }

  if (action === 'delete') {
    void confirmDeleteProject(projectId)
  }
}

function setRenameInput(element: unknown) {
  renameInput.value = element instanceof HTMLInputElement ? element : null
}

async function startRenaming(projectId: string) {
  const project = store.projects.find((item) => item.id === projectId)

  if (!project) {
    return
  }

  editingProjectId.value = projectId
  editingProjectName.value = project.name
  await nextTick()
  renameInput.value?.focus()
  renameInput.value?.select()
}

function cancelRenaming() {
  editingProjectId.value = ''
  editingProjectName.value = ''
}

async function saveProjectName(projectId: string) {
  if (editingProjectId.value !== projectId) {
    return
  }

  const name = editingProjectName.value.trim()

  if (!name) {
    cancelRenaming()
    return
  }

  cancelRenaming()

  try {
    await store.renameProject(projectId, name)
  } catch (error) {
    const message = error instanceof Error ? error.message : t('project.renameFailed')
    uiStore.showToast(message || t('project.renameFailed'), 'error')
  }
}

async function selectProject(projectId: string) {
  if (projectId === store.selectedProjectId) {
    return
  }

  await store.selectProject(projectId)
  visible.value = false
}

async function createProject() {
  const name = projectName.value.trim()

  if (!name || creating.value) {
    return
  }

  creating.value = true

  try {
    await store.createProject({
      name,
      description: '',
    })
    visible.value = false
  } finally {
    creating.value = false
  }
}

async function confirmDeleteProject(projectId: string) {
  const project = store.projects.find((item) => item.id === projectId)

  if (!project) {
    return
  }

  const confirmed = await uiStore.requestConfirm({
    title: t('project.deleteTitle'),
    message: t('project.deleteConfirm', { name: project.name }),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    type: 'danger',
  })

  if (!confirmed) {
    return
  }

  try {
    await store.deleteProject(projectId)
  } catch (error) {
    const message = error instanceof Error ? error.message : t('project.deleteFailed')
    uiStore.showToast(message || t('project.deleteFailed'), 'error')
  }
}
</script>

<style scoped>
.project-manager {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.project-list {
  display: flex;
  max-height: min(46vh, 360px);
  flex-direction: column;
  gap: 6px;
  overflow: auto;
}

.project-item {
  position: relative;
  display: grid;
  min-height: 56px;
  align-items: center;
  border-radius: 12px;
  background: var(--ui-fill-color-light);
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 4px 8px 4px 4px;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.project-item:hover,
.project-item--active {
  border-color: var(--ui-color-primary-light-7);
  background: var(--ui-color-primary-light-9);
}

.project-item > .ui-more-menu {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.project-item:hover > .ui-more-menu,
.project-item:focus-within > .ui-more-menu {
  opacity: 1;
  pointer-events: auto;
}

.project-item__select {
  display: grid;
  min-width: 0;
  height: 100%;
  align-items: center;
  border: 0;
  background: transparent;
  color: var(--ui-text-color-primary);
  cursor: pointer;
  font: inherit;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 8px;
  text-align: left;
}

.project-item__select:focus-visible {
  border-radius: 8px;
  outline: 2px solid var(--ui-color-primary-light-5);
  outline-offset: 1px;
}

.project-item__edit {
  display: grid;
  min-width: 0;
  align-items: center;
  gap: 10px;
  grid-column: 1 / -1;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 8px;
}

.project-item__rename-input {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  border: 1px solid var(--ui-color-primary);
  border-radius: 7px;
  background: var(--ui-bg-color);
  color: var(--ui-text-color-primary);
  font: inherit;
  padding: 7px 10px;
}

.project-item__rename-input:focus {
  outline: 2px solid var(--ui-color-primary-light-7);
  outline-offset: 1px;
}

.project-item__icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 9px;
  background: var(--ui-bg-color);
  color: var(--ui-text-color-secondary);
}

.project-item:hover .project-item__icon,
.project-item--active .project-item__icon {
  color: var(--ui-color-primary);
}

.project-item__details {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.project-item__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-item__status {
  color: var(--ui-color-primary);
  font-size: 12px;
}

.project-create {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--ui-border-color-light);
  padding-top: 16px;
}

.project-create__heading {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ui-text-color-secondary);
  font-size: 13px;
  font-weight: 600;
}

.project-create__controls {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
}
</style>
