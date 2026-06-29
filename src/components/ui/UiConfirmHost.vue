<template>
  <UiDialog
    v-model="visible"
    :title="store.confirm?.title ?? ''"
    width="400px"
    :close-label="t('common.close')"
    @closed="handleClosed"
  >
    <p class="ui-confirm__message">
      {{ store.confirm?.message }}
    </p>
    <template #footer>
      <UiButton @click="store.resolveConfirm(false)">
        {{ store.confirm?.cancelText }}
      </UiButton>
      <UiButton
        :danger="store.confirm?.type === 'danger' || store.confirm?.type === 'warning'"
        variant="primary"
        @click="store.resolveConfirm(true)"
      >
        {{ store.confirm?.confirmText }}
      </UiButton>
    </template>
  </UiDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useUiStore } from '@/stores/ui'

import UiButton from './UiButton.vue'
import UiDialog from './UiDialog.vue'

const store = useUiStore()
const { t } = useI18n()

const visible = computed({
  get: () => Boolean(store.confirm),
  set: (value: boolean) => {
    if (!value) {
      store.resolveConfirm(false)
    }
  },
})

function handleClosed() {
  store.resolveConfirm(false)
}
</script>

<style scoped>
.ui-confirm__message {
  margin: 0;
  color: var(--ui-text-color-primary);
  line-height: 1.6;
}
</style>
