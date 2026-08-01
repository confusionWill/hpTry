<template>
  <UiDialog
    v-model="visible"
    :aria-label="t('common.settings')"
    width="50vw"
    @closed="resetSettingsDialog"
  >
    <div class="settings-tabs" role="tablist" :aria-label="t('common.settings')">
      <button
        v-for="tab in settingsTabs"
        :id="`settings-tab-${tab.value}`"
        :key="tab.value"
        class="settings-tab"
        :class="{ 'settings-tab--active': activeTab === tab.value }"
        type="button"
        role="tab"
        :aria-controls="`settings-panel-${tab.value}`"
        :aria-selected="activeTab === tab.value"
        @click="activeTab = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <section
      v-if="activeTab === 'model'"
      id="settings-panel-model"
      class="settings-panel"
      role="tabpanel"
      aria-labelledby="settings-tab-model"
    >
      <div class="provider-picker">
        <div
          v-for="provider in store.providers"
          :key="provider.id"
          class="provider-item"
        >
          <button
            :aria-label="provider.name"
            class="provider-circle provider-select"
            :class="{ 'provider-circle--active': provider.id === store.selectedProviderId }"
            type="button"
            @click="store.selectProvider(provider.id)"
          >
            <img
              v-if="isDefaultProvider(provider)"
              class="provider-logo"
              :src="deepSeekLogo"
              alt=""
            />
            <span v-else>{{ provider.name }}</span>
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

        <button
          :aria-label="t('provider.add')"
          class="provider-circle provider-circle--add"
          type="button"
          @click="startCreate"
        >
          <Plus :size="30" />
        </button>
      </div>
    </section>

    <section
      v-else
      id="settings-panel-general"
      class="settings-panel settings-panel--general"
      role="tabpanel"
      aria-labelledby="settings-tab-general"
    >
      <div class="general-setting">
        <div class="general-setting__copy">
          <h3>{{ t('settings.language.title') }}</h3>
          <p>{{ t('settings.language.description') }}</p>
        </div>
        <UiSelect
          v-model="selectedLocale"
          class="general-setting__control"
          :options="localeOptions"
          :placeholder="t('settings.language.placeholder')"
        />
      </div>
    </section>
  </UiDialog>

  <UiDialog
    v-model="formVisible"
    :title="formTitle"
    width="520px"
    @closed="resetForm"
  >
    <form @submit.prevent="saveProvider">
      <UiFormItem :label="t('common.name')" required>
        <UiInput
          v-model="form.name"
          :disabled="isEditingDefaultProvider"
          :placeholder="t('provider.namePlaceholder')"
        />
      </UiFormItem>
      <UiFormItem :label="t('provider.baseUrl')" required>
        <UiInput
          v-model="form.baseUrl"
          :disabled="isEditingDefaultProvider"
          :placeholder="t('provider.baseUrlPlaceholder')"
        />
      </UiFormItem>
      <UiFormItem :label="t('provider.model')" required>
        <UiInput
          v-model="form.model"
          :disabled="isEditingDefaultProvider"
          :placeholder="t('provider.modelPlaceholder')"
        />
      </UiFormItem>
      <UiFormItem :label="t('provider.apiKey')" required>
        <UiInput
          v-model="form.apiKey"
          :placeholder="t('provider.apiKeyPlaceholder')"
          type="password"
        />
      </UiFormItem>
    </form>

    <template #footer>
      <UiButton
        v-if="editingProviderId && !isEditingDefaultProvider"
        danger
        text
        @click="confirmDeleteProvider"
      >
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
        {{ t('common.save') }}
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
import UiSelect, { type UiSelectOption } from '@/components/ui/UiSelect.vue'
import deepSeekLogo from '@/assets/deepseek.svg'
import type { AppLocale } from '@/locales'
import {
  CHAT_COMPLETION_RESPONSE_ERROR_I18N_KEYS,
  ChatCompletionRequestError,
  ChatCompletionResponseError,
  requestChatCompletion,
} from '@/services/openai'
import { isDefaultProvider } from '@/services/providers'
import { useAgentStore } from '@/stores/agent'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { Provider } from '@/types/agent'

type SettingsTab = 'model' | 'general'

const visible = defineModel<boolean>({ required: true })

const store = useAgentStore()
const settingsStore = useSettingsStore()
const uiStore = useUiStore()
const { t } = useI18n()
const activeTab = ref<SettingsTab>('model')
const formVisible = ref(false)
const editingProviderId = ref('')
const testingProvider = ref(false)
const form = reactive({
  name: '',
  baseUrl: '',
  apiKey: '',
  model: '',
})

const settingsTabs = computed(() => [
  { label: t('settings.tabs.model'), value: 'model' as const },
  { label: t('settings.tabs.general'), value: 'general' as const },
])

const localeOptions = computed<UiSelectOption[]>(() => [
  { label: t('settings.language.options.zhCN'), value: 'zh-CN' },
  { label: t('settings.language.options.en'), value: 'en' },
])

const selectedLocale = computed({
  get: () => settingsStore.locale,
  set: (value: string) => settingsStore.setLocale(value as AppLocale),
})

const canSave = computed(() =>
  Boolean(form.name.trim() && form.baseUrl.trim() && form.apiKey.trim() && form.model.trim()),
)

const isEditingDefaultProvider = computed(
  () => editingProviderId.value !== '' && isDefaultProvider({ id: editingProviderId.value }),
)

const formTitle = computed(() => (editingProviderId.value ? t('provider.edit') : t('provider.add')))

function resetSettingsDialog() {
  activeTab.value = 'model'
}

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
      thinking: false,
      timeoutMs: 15_000,
    })
    uiStore.showToast(t('provider.testSuccess'), 'success')
  } catch (error) {
    if (error instanceof ChatCompletionRequestError && error.code === 'timeout') {
      uiStore.showToast(t('provider.requestTimeout'), 'error')
      return
    }

    if (error instanceof ChatCompletionResponseError) {
      uiStore.showToast(t(CHAT_COMPLETION_RESPONSE_ERROR_I18N_KEYS[error.code]), 'error')
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
.settings-tabs {
  display: flex;
  gap: 4px;
  padding: 0 4px;
}

.settings-tab {
  position: relative;
  min-width: 76px;
  border: 0;
  background: transparent;
  color: var(--ui-text-color-secondary);
  cursor: pointer;
  font: inherit;
  padding: 9px 14px 11px;
}

.settings-tab::after {
  position: absolute;
  right: 12px;
  bottom: -1px;
  left: 12px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: transparent;
  content: '';
}

.settings-tab:hover,
.settings-tab:focus-visible,
.settings-tab--active {
  color: var(--ui-color-primary);
}

.settings-tab:focus-visible {
  border-radius: 6px;
  outline: 2px solid var(--ui-color-primary-light-5);
  outline-offset: -2px;
}

.settings-tab--active::after {
  background: var(--ui-color-primary);
}

.settings-panel {
  min-height: 50vh;
}

.provider-picker {
  display: flex;
  min-height: inherit;
  align-items: center;
  justify-content: center;
  gap: 22px;
  flex-wrap: wrap;
  padding: 28px 12px 34px;
}

.provider-item {
  position: relative;
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
  place-items: center;
  padding: 10px;
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

.provider-logo {
  width: 52px;
  height: 52px;
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

.settings-panel--general {
  padding: 28px 4px;
}

.general-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 0 12px 24px;
}

.general-setting__copy {
  min-width: 0;
}

.general-setting__copy h3 {
  margin: 0 0 6px;
  color: var(--ui-text-color-primary);
  font-size: 14px;
  font-weight: 600;
}

.general-setting__copy p {
  margin: 0;
  color: var(--ui-text-color-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.general-setting__control {
  width: min(220px, 42%);
  flex: 0 0 auto;
}

@media (max-width: 640px) {
  .general-setting {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
  }

  .general-setting__control {
    width: 100%;
  }
}

</style>
