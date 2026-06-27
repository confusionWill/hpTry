<template>
  <el-drawer v-model="visible" :title="t('provider.title')" size="420px">
    <div class="provider-manager">
      <el-form label-position="top" @submit.prevent>
        <el-form-item :label="t('common.name')" required>
          <el-input v-model="form.name" :placeholder="t('provider.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('provider.baseUrl')" required>
          <el-input v-model="form.baseUrl" :placeholder="t('provider.baseUrlPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('provider.apiKey')" required>
          <el-input
            v-model="form.apiKey"
            :placeholder="t('provider.apiKeyPlaceholder')"
            show-password
            type="password"
          />
        </el-form-item>
        <el-form-item :label="t('provider.model')" required>
          <el-input v-model="form.model" :placeholder="t('provider.modelPlaceholder')" />
        </el-form-item>
        <el-button
          :disabled="!canSave"
          type="primary"
          @click="saveProvider"
        >
          {{ editingProviderId ? t('common.save') : t('provider.add') }}
        </el-button>
      </el-form>

      <el-divider />

      <el-empty
        v-if="store.providers.length === 0"
        :description="t('provider.empty')"
        :image-size="80"
      />

      <div v-else class="provider-list">
        <div
          v-for="provider in store.providers"
          :key="provider.id"
          class="provider-item"
          :class="{ 'provider-item--active': provider.id === store.selectedProviderId }"
        >
          <button type="button" @click="store.selectedProviderId = provider.id">
            <span>{{ provider.name }}</span>
            <small>{{ provider.model }}</small>
          </button>
          <el-button :icon="Edit" text @click="editProvider(provider.id)" />
          <el-button :icon="Delete" text @click="confirmDeleteProvider(provider.id)" />
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { Delete, Edit } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAgentStore } from '@/stores/agent'

const visible = defineModel<boolean>({ required: true })

const store = useAgentStore()
const { t } = useI18n()
const editingProviderId = ref('')
const form = reactive({
  name: '',
  baseUrl: '',
  apiKey: '',
  model: '',
})

const canSave = computed(
  () => form.name.trim() && form.baseUrl.trim() && form.apiKey.trim() && form.model.trim(),
)

function resetForm() {
  editingProviderId.value = ''
  form.name = ''
  form.baseUrl = ''
  form.apiKey = ''
  form.model = ''
}

function editProvider(providerId: string) {
  const provider = store.providers.find((item) => item.id === providerId)

  if (!provider) {
    return
  }

  editingProviderId.value = provider.id
  form.name = provider.name
  form.baseUrl = provider.baseUrl
  form.apiKey = provider.apiKey
  form.model = provider.model
}

async function saveProvider() {
  await store.saveProvider(
    {
      name: form.name,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      model: form.model,
    },
    editingProviderId.value || undefined,
  )
  resetForm()
}

async function confirmDeleteProvider(providerId: string) {
  await ElMessageBox.confirm(t('provider.deleteConfirm'), t('common.delete'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning',
  })
  await store.deleteProvider(providerId)
}
</script>

<style scoped>
.provider-manager {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.provider-item {
  display: grid;
  align-items: center;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  grid-template-columns: 1fr auto auto;
  overflow: hidden;
}

.provider-item--active {
  border-color: var(--el-color-primary);
}

.provider-item button:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  border: 0;
  background: transparent;
  color: var(--el-text-color-primary);
  cursor: pointer;
  padding: 10px 12px;
  text-align: left;
}

.provider-item span,
.provider-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-item small {
  color: var(--el-text-color-secondary);
}
</style>
