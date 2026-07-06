<template>
  <div ref="rootRef" class="preview-aspect-ratio-select">
    <span class="preview-aspect-ratio-select__label">
      {{ t('workspace.livePreview.aspectRatio') }}
    </span>

    <button
      type="button"
      class="preview-aspect-ratio-select__trigger"
      :aria-expanded="open"
      :aria-label="t('workspace.livePreview.aspectRatio')"
      aria-haspopup="listbox"
      @click="open = !open"
      @keydown.down.prevent="open = true"
      @keydown.esc.prevent="open = false"
    >
      <span class="preview-aspect-ratio-select__swatch-frame" aria-hidden="true">
        <span
          class="preview-aspect-ratio-select__swatch"
          :class="{ 'preview-aspect-ratio-select__swatch--none': selectedOption.value === 'none' }"
          :style="getRatioSwatchStyle(selectedOption)"
        />
      </span>
      <span class="preview-aspect-ratio-select__value">{{ selectedOption.label }}</span>
      <ChevronDown class="preview-aspect-ratio-select__icon" aria-hidden="true" />
    </button>

    <div v-if="open" class="preview-aspect-ratio-select__menu" role="listbox">
      <button
        v-for="option in aspectRatioOptions"
        :key="option.value"
        type="button"
        class="preview-aspect-ratio-select__option"
        :class="{ 'preview-aspect-ratio-select__option--active': model === option.value }"
        :aria-selected="model === option.value"
        role="option"
        @click="selectOption(option.value)"
      >
        <span class="preview-aspect-ratio-select__swatch-frame" aria-hidden="true">
          <span
            class="preview-aspect-ratio-select__swatch"
            :class="{ 'preview-aspect-ratio-select__swatch--none': option.value === 'none' }"
            :style="getRatioSwatchStyle(option)"
          />
        </span>
        <span>{{ option.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

interface AspectRatioOption {
  label: string
  ratio: number | null
  value: string
}

const model = defineModel<string>({ required: true })

const { t } = useI18n()
const open = ref(false)
const rootRef = ref<HTMLElement>()

const aspectRatioOptions = computed<AspectRatioOption[]>(() => [
  {
    label: t('workspace.livePreview.aspectRatioNone'),
    ratio: null,
    value: 'none',
  },
  {
    label: '16:9',
    ratio: 16 / 9,
    value: '16-9',
  },
  {
    label: '9:16',
    ratio: 9 / 16,
    value: '9-16',
  },
  {
    label: '4:3',
    ratio: 4 / 3,
    value: '4-3',
  },
  {
    label: '3:4',
    ratio: 3 / 4,
    value: '3-4',
  },
])

const selectedOption = computed(
  () =>
    aspectRatioOptions.value.find((option) => option.value === model.value) ??
    aspectRatioOptions.value[0],
)

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})

function selectOption(value: string) {
  model.value = value
  open.value = false
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!rootRef.value?.contains(event.target as Node)) {
    open.value = false
  }
}

function getRatioSwatchStyle(option: AspectRatioOption): Record<string, string> {
  if (option.ratio === null) {
    return {
      height: '16px',
      width: '16px',
    }
  }

  const size = 16
  const width = option.ratio >= 1 ? size : size * option.ratio
  const height = option.ratio >= 1 ? size / option.ratio : size

  return {
    height: `${height}px`,
    width: `${width}px`,
  }
}
</script>

<style scoped>
.preview-aspect-ratio-select {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.preview-aspect-ratio-select__label {
  color: var(--ui-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.preview-aspect-ratio-select__trigger {
  display: inline-flex;
  width: 116px;
  min-height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--ui-border-color);
  border-radius: 7px;
  background: var(--ui-bg-color);
  color: var(--ui-text-color-primary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  padding: 0 9px;
}

.preview-aspect-ratio-select__trigger:hover {
  border-color: var(--ui-color-primary-light-5);
}

.preview-aspect-ratio-select__trigger:focus-visible {
  border-color: var(--ui-color-primary);
  outline: 0;
}

.preview-aspect-ratio-select__value {
  flex: 1;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-aspect-ratio-select__icon {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  color: var(--ui-text-color-secondary);
}

.preview-aspect-ratio-select__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  display: grid;
  width: 116px;
  overflow: hidden;
  border: 1px solid var(--ui-border-color-light);
  border-radius: 7px;
  background: var(--ui-bg-color);
  box-shadow: 0 12px 28px rgb(15 23 42 / 14%);
  padding: 4px;
}

.preview-aspect-ratio-select__option {
  display: flex;
  min-height: 32px;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text-color-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  padding: 0 8px;
  text-align: left;
}

.preview-aspect-ratio-select__option:hover {
  background: var(--ui-fill-color-light);
  color: var(--ui-text-color-primary);
}

.preview-aspect-ratio-select__option--active {
  background: var(--ui-fill-color-light);
  color: var(--ui-text-color-primary);
  font-weight: 650;
}

.preview-aspect-ratio-select__swatch-frame {
  display: grid;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  place-items: center;
}

.preview-aspect-ratio-select__swatch {
  display: inline-block;
  border: 1px solid currentColor;
  border-radius: 2px;
  background: currentColor;
  opacity: 0.78;
}

.preview-aspect-ratio-select__swatch--none {
  aspect-ratio: 1;
  background:
    linear-gradient(135deg, transparent 45%, currentColor 47%, currentColor 53%, transparent 55%),
    var(--ui-bg-color);
}

@media (max-width: 980px) {
  .preview-aspect-ratio-select {
    width: 100%;
    justify-content: space-between;
  }

  .preview-aspect-ratio-select__menu {
    left: auto;
    right: 0;
  }
}
</style>
