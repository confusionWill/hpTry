<template>
  <UiDialog
    v-model="visible"
    :aria-label="t('common.settings')"
    width="50vw"
    @closed="resetForm"
  >
    <div class="provider-picker">
      <div
        v-for="provider in store.providers"
        :key="provider.id"
        class="provider-item"
      >
        <div
          class="provider-circle"
          :class="{ 'provider-circle--active': provider.id === store.selectedProviderId }"
        >
          <button
            class="provider-select"
            type="button"
            @click="store.selectProvider(provider.id)"
          >
            <span>{{ provider.name }}</span>
          </button>
          <button
            :aria-label="t('common.edit')"
            class="provider-edit"
            type="button"
            @click.stop="editProvider(provider.id)"
          >
            <Edit3 :size="16" />
          </button>
        </div>
      </div>

      <button
        :aria-label="t('provider.add')"
        class="provider-circle provider-circle--add"
        type="button"
        @click="startCreate"
      >
        <Plus :size="30" />
      </button>
    </div>
  </UiDialog>

  <UiDialog
    v-model="formVisible"
    :close-label="t('common.close')"
    :title="formTitle"
    width="520px"
    @closed="resetForm"
  >
    <form @submit.prevent="saveProvider">
      <UiFormItem :label="t('common.name')" required>
        <UiInput v-model="form.name" :placeholder="t('provider.namePlaceholder')" />
      </UiFormItem>
      <UiFormItem :label="t('provider.baseUrl')" required>
        <UiInput v-model="form.baseUrl" :placeholder="t('provider.baseUrlPlaceholder')" />
      </UiFormItem>
      <UiFormItem :label="t('provider.apiKey')" required>
        <UiInput
          v-model="form.apiKey"
          :placeholder="t('provider.apiKeyPlaceholder')"
          type="password"
        />
      </UiFormItem>
      <UiFormItem :label="t('provider.model')" required>
        <UiInput v-model="form.model" :placeholder="t('provider.modelPlaceholder')" />
      </UiFormItem>
    </form>

    <template #footer>
      <UiButton v-if="editingProviderId" danger text @click="confirmDeleteProvider">
        {{ t('common.delete') }}
      </UiButton>
      <span />
      <UiButton
        :disabled="!canSave || testingProvider"
        :loading="testingProvider"
        @click="testProvider"
      >
        {{ t('provider.test') }}
      </UiButton>
      <UiButton @click="formVisible = false">
        {{ t('common.cancel') }}
      </UiButton>
      <UiButton :disabled="!canSave || testingProvider" variant="primary" @click="saveProvider">
        {{ editingProviderId ? t('common.save') : t('provider.add') }}
      </UiButton>
    </template>
  </UiDialog>
</template>

<script setup lang="ts">
import { Edit3, Plus } from '@lucide/vue'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import UiDialog from '@/components/ui/UiDialog.vue'
import UiFormItem from '@/components/ui/UiFormItem.vue'
import UiInput from '@/components/ui/UiInput.vue'
import { ChatCompletionRequestError, requestChatCompletion } from '@/services/openai'
import { useAgentStore } from '@/stores/agent'
import { useUiStore } from '@/stores/ui'
import type { Provider } from '@/types/agent'

const visible = defineModel<boolean>({ required: true })

const store = useAgentStore()
const uiStore = useUiStore()
const { t } = useI18n()
const formVisible = ref(false)
const editingProviderId = ref('')
const testingProvider = ref(false)
const form = reactive({
  name: '',
  baseUrl: '',
  apiKey: '',
  model: '',
})

const canSave = computed(() =>
  Boolean(form.name.trim() && form.baseUrl.trim() && form.apiKey.trim() && form.model.trim()),
)

const formTitle = computed(() => (editingProviderId.value ? t('provider.edit') : t('provider.add')))

function resetForm() {
  editingProviderId.value = ''
  form.name = ''
  form.baseUrl = ''
  form.apiKey = ''
  form.model = ''
}

function startCreate() {
  resetForm()
  formVisible.value = true
}

function editProvider(providerId: string) {
  const provider = store.providers.find((item) => item.id === providerId)

  if (!provider) {
    return
  }

  store.selectProvider(provider.id)
  editingProviderId.value = provider.id
  form.name = provider.name
  form.baseUrl = provider.baseUrl
  form.apiKey = provider.apiKey
  form.model = provider.model
  formVisible.value = true
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
  formVisible.value = false
}

function providerFromForm(): Provider {
  const timestamp = Date.now()

  return {
    id: editingProviderId.value || 'provider-test',
    name: form.name.trim(),
    baseUrl: form.baseUrl.trim(),
    apiKey: form.apiKey.trim(),
    model: form.model.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

async function testProvider() {
  if (!canSave.value || testingProvider.value) {
    return
  }

  testingProvider.value = true

  try {
    await requestChatCompletion({
      provider: providerFromForm(),
      messages: [
        {
          role: 'system',
          content: 'Reply with ok.',
        },
        {
          role: 'user',
          content: 'ok',
        },
      ],
      toolChoice: 'none',
      timeoutMs: 15_000,
    })
    uiStore.showToast(t('provider.testSuccess'), 'success')
  } catch (error) {
    if (error instanceof ChatCompletionRequestError && error.code === 'timeout') {
      uiStore.showToast(t('provider.requestTimeout'), 'error')
      return
    }

    const message = error instanceof Error ? error.message : t('provider.testFailed')
    uiStore.showToast(message || t('provider.testFailed'), 'error')
  } finally {
    testingProvider.value = false
  }
}

async function confirmDeleteProvider() {
  const providerId = editingProviderId.value

  if (!providerId) {
    return
  }

  const confirmed = await uiStore.requestConfirm({
    title: t('common.delete'),
    message: t('provider.deleteConfirm'),
    confirmText: t('common.confirm'),
    cancelText: t('common.cancel'),
    type: 'warning',
  })

  if (!confirmed) {
    return
  }

  await store.deleteProvider(providerId)
  formVisible.value = false
}
</script>

<style scoped>
.provider-picker {
  display: flex;
  min-height: 50vh;
  align-items: center;
  justify-content: center;
  gap: 22px;
  flex-wrap: wrap;
  padding: 28px 12px 34px;
}

.provider-item {
  display: block;
}

.provider-circle {
  position: relative;
  display: grid;
  width: 100px;
  height: 100px;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: rgba(241, 245, 249, 0.54);
  color: var(--ui-text-color-secondary);
  cursor: pointer;
  font: inherit;
  line-height: 1.2;
  text-align: center;
}

.provider-select {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  line-height: 1.2;
  padding: 10px;
  text-align: center;
}

.provider-circle:hover,
.provider-circle--active {
  background: var(--ui-color-primary-light-9);
  color: var(--ui-color-primary);
}

.provider-circle span {
  display: -webkit-box;
  max-width: 100%;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
}

.provider-edit {
  position: absolute;
  left: 50%;
  bottom: 2px;
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: var(--ui-text-color-secondary);
  cursor: pointer;
  display: grid;
  padding: 0;
  place-items: center;
  transform: translateX(-50%);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.provider-edit:hover,
.provider-edit:focus {
  color: var(--ui-color-primary);
}

.provider-edit:focus {
  outline: 0;
}

.provider-item:hover .provider-edit,
.provider-item:focus-within .provider-edit {
  opacity: 1;
}

.provider-circle--add {
  font-size: 30px;
}

</style>
