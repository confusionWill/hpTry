<template>
  <button
    class="ui-button"
    :class="[
      `ui-button--${variant}`,
      {
        'ui-button--circle': circle,
        'ui-button--text': text,
        'ui-button--danger': danger,
        'ui-button--loading': loading,
      },
    ]"
    :disabled="disabled || loading"
    type="button"
  >
    <span v-if="$slots.icon || loading" class="ui-button__icon" aria-hidden="true">
      <LoaderCircle v-if="loading" class="ui-button__spinner" :size="16" />
      <slot v-else name="icon" />
    </span>
    <span v-if="$slots.default" class="ui-button__label">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'

withDefaults(
  defineProps<{
    variant?: 'default' | 'primary'
    danger?: boolean
    text?: boolean
    circle?: boolean
    disabled?: boolean
    loading?: boolean
  }>(),
  {
    variant: 'default',
    danger: false,
    text: false,
    circle: false,
    disabled: false,
    loading: false,
  },
)
</script>

<style scoped>
.ui-button {
  display: inline-flex;
  min-width: 32px;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--ui-border-color);
  border-radius: 7px;
  background: var(--ui-bg-color);
  color: var(--ui-text-color-primary);
  cursor: pointer;
  font: inherit;
  line-height: 1;
  padding: 7px 12px;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}

.ui-button:hover:not(:disabled) {
  border-color: var(--ui-color-primary);
  color: var(--ui-color-primary);
}

.ui-button:focus-visible {
  outline: 2px solid var(--ui-color-primary-light-5);
  outline-offset: 2px;
}

.ui-button:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.ui-button--primary {
  border-color: var(--ui-color-primary);
  background: var(--ui-color-primary);
  color: var(--ui-color-white);
}

.ui-button--primary:hover:not(:disabled) {
  background: var(--ui-color-primary-dark-2);
  color: var(--ui-color-white);
}

.ui-button--circle {
  width: 34px;
  min-width: 34px;
  height: 34px;
  border-radius: 50%;
  padding: 0;
}

.ui-button--text {
  min-width: 28px;
  min-height: 28px;
  border-color: transparent;
  background: transparent;
  padding: 4px;
}

.ui-button--danger {
  color: var(--ui-color-danger);
}

.ui-button--primary.ui-button--danger {
  border-color: var(--ui-color-danger);
  background: var(--ui-color-danger);
  color: var(--ui-color-white);
}

.ui-button--danger:hover:not(:disabled) {
  border-color: var(--ui-color-danger);
  color: var(--ui-color-danger);
}

.ui-button--primary.ui-button--danger:hover:not(:disabled) {
  background: #b91c1c;
  color: var(--ui-color-white);
}

.ui-button__icon,
.ui-button__label {
  display: inline-flex;
  align-items: center;
}

.ui-button__spinner {
  animation: ui-button-spin 0.8s linear infinite;
}

@keyframes ui-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
