<template>
  <Teleport to="body">
    <div class="ui-toast-host" aria-live="polite">
      <TransitionGroup name="ui-toast">
        <div
          v-for="toast in store.toasts"
          :key="toast.id"
          class="ui-toast"
          :class="`ui-toast--${toast.type}`"
        >
          {{ toast.message }}
          <button type="button" :aria-label="t('common.close')" @click="store.dismissToast(toast.id)">
            <X :size="15" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

import { useUiStore } from '@/stores/ui'

const store = useUiStore()
const { t } = useI18n()
</script>

<style scoped>
.ui-toast-host {
  position: fixed;
  z-index: 1200;
  top: 18px;
  right: 18px;
  display: grid;
  gap: 10px;
  width: min(360px, calc(100vw - 36px));
}

.ui-toast {
  display: grid;
  align-items: center;
  gap: 10px;
  grid-template-columns: 1fr auto;
  border: 1px solid var(--ui-border-color-light);
  border-radius: 8px;
  background: var(--ui-bg-color);
  box-shadow: 0 12px 36px rgba(15, 23, 42, 0.16);
  color: var(--ui-text-color-primary);
  font-size: 14px;
  line-height: 1.4;
  padding: 11px 12px;
}

.ui-toast--success {
  border-color: var(--ui-color-success);
}

.ui-toast--warning {
  border-color: var(--ui-color-warning);
}

.ui-toast--error {
  border-color: var(--ui-color-danger);
}

.ui-toast button {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text-color-secondary);
  cursor: pointer;
}

.ui-toast button:hover {
  background: var(--ui-fill-color-light);
  color: var(--ui-text-color-primary);
}

.ui-toast-enter-active,
.ui-toast-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.ui-toast-enter-from,
.ui-toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
