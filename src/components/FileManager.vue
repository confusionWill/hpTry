<template>
  <section class="file-manager">
    <div class="file-manager__header">
      <h2>{{ t('file.title') }}</h2>
      <el-button :disabled="!store.selectedProjectId" :icon="Plus" circle @click="newFile" />
    </div>

    <div class="file-layout">
      <div class="file-list">
        <el-empty
          v-if="store.files.length === 0"
          :description="t('file.empty')"
          :image-size="70"
        />
        <button
          v-for="file in store.files"
          :key="file.id"
          class="file-item"
          :class="{ 'file-item--active': file.id === store.selectedFileId }"
          type="button"
          @click="selectFile(file.id)"
        >
          {{ file.path }}
        </button>
      </div>

      <el-form class="file-editor" label-position="top" @submit.prevent>
        <el-form-item :label="t('file.path')" required>
          <el-input v-model="path" :placeholder="t('file.pathPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('file.content')" class="content-field">
          <el-input
            v-model="content"
            :placeholder="t('file.contentPlaceholder')"
            resize="none"
            type="textarea"
          />
        </el-form-item>
        <div class="file-actions">
          <el-button
            :disabled="!store.selectedFileId"
            :icon="Delete"
            @click="confirmDeleteFile"
          >
            {{ t('common.delete') }}
          </el-button>
          <el-button :disabled="!canSave" type="primary" @click="saveFile">
            {{ t('common.save') }}
          </el-button>
        </div>
      </el-form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Delete, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAgentStore } from '@/stores/agent'

const store = useAgentStore()
const { t } = useI18n()

const path = ref('')
const content = ref('')
const isEditingDraft = ref(false)

const canSave = computed(() => store.selectedProjectId && path.value.trim())

watch(
  () => store.selectedFile,
  (file) => {
    isEditingDraft.value = !file && isEditingDraft.value
    path.value = file?.path ?? ''
    content.value = file?.content ?? ''
  },
  { immediate: true },
)

function newFile() {
  store.selectedFileId = ''
  isEditingDraft.value = true
  path.value = ''
  content.value = ''
}

async function selectFile(fileId: string) {
  isEditingDraft.value = false
  await store.selectFile(fileId)
}

async function saveFile() {
  if (!store.selectedProjectId) {
    return
  }

  await store.saveFile({
    projectId: store.selectedProjectId,
    path: path.value,
    content: content.value,
  })
  isEditingDraft.value = false
  ElMessage.success(t('file.saveSuccess'))
}

async function confirmDeleteFile() {
  if (!store.selectedFileId) {
    return
  }

  await ElMessageBox.confirm(t('file.deleteConfirm'), t('common.delete'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning',
  })
  await store.deleteFile(store.selectedFileId)
}
</script>

<style scoped>
.file-manager {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
}

.file-manager__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.file-manager__header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.file-layout {
  display: grid;
  min-height: 0;
  flex: 1;
  gap: 12px;
  grid-template-columns: 190px minmax(0, 1fr);
}

.file-list {
  min-height: 0;
  overflow: auto;
}

.file-item {
  display: block;
  width: 100%;
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-primary);
  cursor: pointer;
  overflow: hidden;
  padding: 7px 9px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-item:hover,
.file-item--active {
  border-color: var(--el-color-primary-light-7);
  background: var(--el-color-primary-light-9);
}

.file-editor {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.content-field {
  min-height: 0;
  flex: 1;
}

.content-field :deep(.el-form-item__content),
.content-field :deep(.el-textarea),
.content-field :deep(.el-textarea__inner) {
  height: 100%;
}

.content-field :deep(.el-textarea__inner) {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  line-height: 1.5;
}

.file-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
