<template>
  <div class="ui-more-menu" @pointerdown.stop>
    <button
      :aria-expanded="open"
      :aria-label="triggerLabel"
      aria-haspopup="menu"
      class="ui-more-menu__trigger"
      type="button"
      @click="toggleMenu"
      @keydown.esc="closeMenu"
    >
      <Ellipsis :size="18" aria-hidden="true" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        class="ui-more-menu__popover"
        role="menu"
        :style="{
          left: `${position.left}px`,
          top: `${position.top}px`,
        }"
        @pointerdown.stop
      >
        <button
          v-for="item in items"
          :key="item.key"
          :class="{ 'ui-more-menu__item--danger': item.danger }"
          :disabled="item.disabled"
          role="menuitem"
          type="button"
          @click="selectItem(item)"
        >
          <component :is="item.icon" v-if="item.icon" :size="15" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script lang="ts">
import type { Component } from 'vue'

export interface UiMoreMenuItem {
  key: string
  label: string
  icon?: Component
  danger?: boolean
  disabled?: boolean
}

let closeActiveMenu: (() => void) | null = null
</script>

<script setup lang="ts">
import { Ellipsis } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  triggerLabel: string
  items: UiMoreMenuItem[]
}>()

const emit = defineEmits<{
  select: [key: string]
  'update:open': [value: boolean]
}>()

const menuWidth = 128
const open = ref(false)
const position = ref({ left: 0, top: 0 })

function closeMenu() {
  if (!open.value) {
    return
  }

  open.value = false
  emit('update:open', false)

  if (closeActiveMenu === closeMenu) {
    closeActiveMenu = null
  }
}

function toggleMenu(event: MouseEvent) {
  if (open.value) {
    closeMenu()
    return
  }

  const trigger = event.currentTarget as HTMLElement
  const bounds = trigger.getBoundingClientRect()
  const menuHeight = props.items.length * 36 + 10
  const gap = 4
  const top =
    bounds.bottom + gap + menuHeight <= window.innerHeight
      ? bounds.bottom + gap
      : bounds.top - menuHeight - gap

  position.value = {
    left: Math.min(
      window.innerWidth - menuWidth - 8,
      Math.max(8, bounds.right - menuWidth),
    ),
    top: Math.max(8, top),
  }
  closeActiveMenu?.()
  closeActiveMenu = closeMenu
  open.value = true
  emit('update:open', true)
}

function selectItem(item: UiMoreMenuItem) {
  if (item.disabled) {
    return
  }

  closeMenu()
  emit('select', item.key)
}

onMounted(() => {
  document.addEventListener('pointerdown', closeMenu)
  window.addEventListener('resize', closeMenu)
  window.addEventListener('scroll', closeMenu, true)
})

onBeforeUnmount(() => {
  closeMenu()
  document.removeEventListener('pointerdown', closeMenu)
  window.removeEventListener('resize', closeMenu)
  window.removeEventListener('scroll', closeMenu, true)
})
</script>

<style scoped>
.ui-more-menu {
  display: inline-flex;
}

.ui-more-menu__trigger {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text-color-secondary);
  cursor: pointer;
  padding: 0;
}

.ui-more-menu__trigger:hover,
.ui-more-menu__trigger:focus-visible,
.ui-more-menu__trigger[aria-expanded="true"] {
  background: var(--ui-bg-color);
  color: var(--ui-color-primary);
}

.ui-more-menu__trigger:focus-visible {
  outline: 2px solid var(--ui-color-primary-light-5);
  outline-offset: 1px;
}

.ui-more-menu__popover {
  position: fixed;
  display: flex;
  width: 128px;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--ui-border-color-light);
  border-radius: 9px;
  background: var(--ui-bg-color);
  box-shadow: 0 10px 28px rgb(15 23 42 / 16%);
  padding: 4px;
  z-index: 3000;
}

.ui-more-menu__popover button {
  display: flex;
  min-height: 34px;
  align-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-color-primary);
  cursor: pointer;
  font: inherit;
  gap: 8px;
  padding: 7px 9px;
  text-align: left;
}

.ui-more-menu__popover button:hover:not(:disabled),
.ui-more-menu__popover button:focus-visible {
  background: var(--ui-fill-color-light);
  outline: 0;
}

.ui-more-menu__popover button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ui-more-menu__popover .ui-more-menu__item--danger {
  color: var(--ui-color-danger);
}
</style>
