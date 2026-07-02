<template>
  <Teleport to="body">
    <Transition name="ui-dialog">
      <div
        v-if="model"
        class="ui-dialog__overlay"
        role="presentation"
        :style="{ zIndex: currentZIndex }"
        @click.self="close"
      >
        <section
          class="ui-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="title || ariaLabel"
          :style="{ width }"
        >
          <header v-if="showHeader && (title || $slots.header)" class="ui-dialog__header">
            <slot name="header">
              <h2>{{ title }}</h2>
            </slot>
            <button
              v-if="showClose"
              class="ui-dialog__close"
              :aria-label="closeLabel"
              type="button"
              @click="close"
            >
              <X :size="18" />
            </button>
          </header>
          <div class="ui-dialog__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="ui-dialog__footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts">
const dialogZIndexBase = 1000
const dialogZIndexStep = 10
let nextDialogZIndex = dialogZIndexBase
</script>

<script setup lang="ts">
import { X } from '@lucide/vue'
import { ref, watch } from 'vue'

const model = defineModel<boolean>({ required: true })

withDefaults(
  defineProps<{
    title?: string
    ariaLabel?: string
    width?: string
    closeLabel?: string
    showHeader?: boolean
    showClose?: boolean
  }>(),
  {
    title: '',
    ariaLabel: '',
    width: '420px',
    closeLabel: 'Close',
    showHeader: false,
    showClose: false,
  },
)

const emit = defineEmits<{
  closed: []
}>()

const currentZIndex = ref(dialogZIndexBase)

function close() {
  model.value = false
}

watch(
  () => model.value,
  (visible, previousVisible) => {
    if (visible) {
      currentZIndex.value = nextDialogZIndex
      nextDialogZIndex += dialogZIndexStep
    }

    if (!visible && previousVisible) {
      emit('closed')
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.ui-dialog__overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(248, 250, 252, 0.52);
  backdrop-filter: blur(20px) saturate(140%);
  padding: 24px;
  transition:
    background 0.5s ease,
    backdrop-filter 0.5s ease;
}

.ui-dialog__overlay:hover:not(:has(.ui-dialog:hover)) {
  background: rgba(248, 250, 252, 0.2);
  backdrop-filter: blur(5px) saturate(120%);
}

.ui-dialog {
  max-width: min(100%, 760px);
  max-height: min(86vh, 760px);
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  background: var(--ui-bg-color);
  box-shadow: 
    inset 0 0 5px rgba(0, 0, 0, 0.05),
    0 0 10px rgba(15, 23, 42, 0.14);
  overflow: hidden;
}

.ui-dialog__header {
  display: flex;
  min-height: 54px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--ui-border-color-light);
  padding: 14px 16px;
}

.ui-dialog__header h2 {
  margin: 0;
  color: var(--ui-text-color-primary);
  font-size: 16px;
  font-weight: 650;
}

.ui-dialog__close {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-color-secondary);
  cursor: pointer;
}

.ui-dialog__close:hover {
  background: var(--ui-fill-color-light);
  color: var(--ui-text-color-primary);
}

.ui-dialog__body {
  min-height: 0;
  overflow: auto;
  padding: 16px;
}

.ui-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--ui-border-color-light);
  padding: 12px 16px;
}

.ui-dialog-enter-active,
.ui-dialog-leave-active {
  transition: opacity 0.16s ease;
}

.ui-dialog-enter-from,
.ui-dialog-leave-to {
  opacity: 0;
}
</style>
