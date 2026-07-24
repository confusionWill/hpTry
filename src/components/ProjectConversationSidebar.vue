<template>
  <aside class="sidebar">
    <div class="section">
      <div class="section__header project-picker">
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
        <button
          :aria-label="t('project.openManager')"
          class="project-entry"
          type="button"
          @click="projectManagerVisible = true"
        >
          <span class="project-entry__icon" aria-hidden="true">
            <FolderKanban :size="17" />
          </span>
          <span class="project-entry__name">
            {{ store.selectedProject?.name ?? t('project.manage') }}
          </span>
          <ChevronsUpDown :size="15" aria-hidden="true" />
        </button>
      </div>
    </div>

    <PresentationSlideSidebar
      v-if="presentationStore.manifest?.slides.length && presentationStore.previewUrl"
      :active-page="presentationStore.activeSlidePage"
      :canvas-size="presentationStore.selectedCanvasSize"
      :preview-url="presentationStore.previewUrl"
      :slides="presentationStore.manifest.slides"
      @select="presentationStore.selectSlide"
    />

    <div class="section conversations">
      <div class="conversation-actions">
        <UiButton
          :aria-label="t('conversation.new')"
          class="new-conversation-button"
          :disabled="!store.selectedProjectId"
          @click="store.startDraftConversation()"
        >
          <template #icon>
            <span class="new-conversation-button__icons">
              <MessageCircle :size="17" />
              <Plus :size="16" />
            </span>
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
              <UiMoreMenu
                :items="conversationMenuItems(conversation.id)"
                :trigger-label="
                  t('conversation.actionsAriaLabel', { title: conversation.title })
                "
                @select="
                  handleConversationAction(conversation.id, conversation.title, $event)
                "
              />
            </template>
          </div>
        </div>
      </div>
    </div>

    <ProjectManager v-model="projectManagerVisible" />
  </aside>
</template>

<script setup lang="ts">
import {
  Check,
  ChevronsUpDown,
  FolderKanban,
  MessageCircle,
  Pencil,
  Plus,
  Settings,
  Trash2,
  X,
} from '@lucide/vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiMoreMenu, { type UiMoreMenuItem } from '@/components/ui/UiMoreMenu.vue'
import PresentationSlideSidebar from '@/components/PresentationSlideSidebar.vue'
import ProjectManager from '@/components/ProjectManager.vue'
import { useAgentStore } from '@/stores/agent'
import { usePresentationStore } from '@/stores/presentation'
import { useUiStore } from '@/stores/ui'

defineEmits<{
  openProviders: []
}>()

const store = useAgentStore()
const presentationStore = usePresentationStore()
const uiStore = useUiStore()
const { t } = useI18n()

const projectManagerVisible = ref(false)
const editingConversationId = ref('')
const editingConversationTitle = ref('')

function conversationMenuItems(conversationId: string): UiMoreMenuItem[] {
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
      disabled: store.isConversationRunning(conversationId),
    },
  ]
}

function handleConversationAction(conversationId: string, title: string, action: string) {
  if (action === 'rename') {
    startEditingConversation(conversationId, title)
    return
  }

  if (action === 'delete') {
    void confirmDeleteConversation(conversationId)
  }
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
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  height: 100%;
  flex-direction: column;
  gap: 16px;
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

.provider-entry {
  min-width: 0;
}

.project-picker {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-entry {
  display: grid;
  min-width: 0;
  min-height: 38px;
  flex: 1;
  align-items: center;
  border: 0;
  border-radius: 12px;
  background:
    linear-gradient(135deg, var(--ui-color-primary-light-9), var(--ui-bg-color));
  box-shadow: inset 0 0 0 1px var(--ui-color-primary-light-7);
  color: var(--ui-text-color-primary);
  cursor: pointer;
  font: inherit;
  gap: 8px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: 7px 10px;
  text-align: left;
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.project-entry:hover {
  box-shadow:
    inset 0 0 0 1px var(--ui-color-primary-light-5),
    0 5px 14px rgb(15 23 42 / 8%);
  transform: translateY(-1px);
}

.project-entry:focus-visible {
  outline: 2px solid var(--ui-color-primary-light-5);
  outline-offset: 2px;
}

.project-entry__icon {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 8px;
  background: var(--ui-bg-color);
  color: var(--ui-color-primary);
}

.project-entry__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-actions {
  display: flex;
  justify-content: flex-end;
}

.new-conversation-button {
  min-width: 72px;
  border-radius: 999px;
  padding-inline: 18px;
}

.new-conversation-button__icons {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.conversations {
  position: absolute;
  top: 64px;
  bottom: 76px;
  left: 0;
  width: calc(100% - 16px);
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--ui-border-color-light);
  border-left: 0;
  border-radius: 0 16px 16px 0;
  background: var(--ui-bg-color);
  box-shadow: 10px 0 28px rgb(15 23 42 / 12%);
  padding: 14px 18px 14px 14px;
  transform: translateX(calc(-100% + 18px));
  transition:
    transform 300ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 300ms ease;
  will-change: transform;
  z-index: 1;
}

.conversations::after {
  position: absolute;
  top: 50%;
  right: 5px;
  width: 4px;
  height: 44px;
  border-radius: 999px;
  background: var(--ui-border-color);
  content: "";
  transform: translateY(-50%);
  transition: background-color 200ms ease;
}

.conversations:hover,
.conversations:focus-within {
  box-shadow: 14px 0 36px rgb(15 23 42 / 18%);
  transform: translateX(0);
}

.conversations:hover::after,
.conversations:focus-within::after {
  background: var(--ui-color-primary-light-5);
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

.conversation-item__actions > .ui-more-menu {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.conversation-item:hover .conversation-item__actions > .ui-more-menu,
.conversation-item:focus-within .conversation-item__actions > .ui-more-menu {
  opacity: 1;
  pointer-events: auto;
}

.conversation-item:hover,
.conversation-item--active {
  border-color: var(--ui-color-primary-light-7);
  background: var(--ui-color-primary-light-9);
}

@media (prefers-reduced-motion: reduce) {
  .conversations {
    transition: none;
  }
}
</style>
