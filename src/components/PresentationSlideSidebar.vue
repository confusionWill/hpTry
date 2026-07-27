<template>
  <aside class="slide-sidebar" :aria-label="t('workspace.livePreview.slideList')">
    <ol class="slide-sidebar__list">
      <li v-for="(_slide, index) in slides" :key="`${previewUrl}:${index}`">
        <button
          class="slide-sidebar__item"
          :class="{ 'slide-sidebar__item--active': activePage === index + 1 }"
          type="button"
          :aria-current="activePage === index + 1 ? 'page' : undefined"
          :aria-label="t('workspace.livePreview.openSlide', { page: index + 1 })"
          @click="emit('select', index + 1)"
        >
          <span class="slide-sidebar__number">{{ index + 1 }}</span>
          <span
            :ref="(element) => setThumbnailRef(index, element)"
            class="slide-sidebar__thumbnail"
            :style="thumbnailStyle"
          >
            <iframe
              aria-hidden="true"
              class="slide-sidebar__frame"
              loading="lazy"
              tabindex="-1"
              :src="thumbnailUrl(index + 1)"
              :title="t('workspace.livePreview.slideThumbnail', { page: index + 1 })"
            />
            <span class="slide-sidebar__frame-mask" aria-hidden="true" />
          </span>
        </button>
      </li>
    </ol>
  </aside>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance, CSSProperties } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { PreviewCanvasSize } from '@/utils/presentationCanvas'

const props = defineProps<{
  activePage: number
  canvasSize: PreviewCanvasSize
  previewUrl: string
  slides: string[]
}>()

const emit = defineEmits<{
  select: [page: number]
}>()

const { t } = useI18n()
const thumbnailElements = new Map<number, HTMLElement>()
let thumbnailResizeObserver: ResizeObserver | null = null

const thumbnailStyle = computed<CSSProperties>(() => ({
  aspectRatio: `${props.canvasSize.width} / ${props.canvasSize.height}`,
  '--slide-canvas-width': `${props.canvasSize.width}px`,
  '--slide-canvas-height': `${props.canvasSize.height}px`,
}))

onMounted(() => {
  thumbnailResizeObserver = new ResizeObserver((entries) => {
    entries.forEach(({ target }) => updateThumbnailScale(target as HTMLElement))
  })

  thumbnailElements.forEach((element) => {
    thumbnailResizeObserver?.observe(element)
    updateThumbnailScale(element)
  })
})

onBeforeUnmount(() => {
  thumbnailResizeObserver?.disconnect()
})

watch(
  () => props.canvasSize,
  () => nextTick(() => thumbnailElements.forEach(updateThumbnailScale)),
)

function setThumbnailRef(
  index: number,
  element: Element | ComponentPublicInstance | null,
) {
  const previousElement = thumbnailElements.get(index)

  if (previousElement) {
    thumbnailResizeObserver?.unobserve(previousElement)
    thumbnailElements.delete(index)
  }

  if (!(element instanceof HTMLElement)) {
    return
  }

  thumbnailElements.set(index, element)
  thumbnailResizeObserver?.observe(element)
  updateThumbnailScale(element)
}

function updateThumbnailScale(element: HTMLElement) {
  const scale = Math.min(
    element.clientWidth / props.canvasSize.width,
    element.clientHeight / props.canvasSize.height,
  )

  element.style.setProperty('--slide-thumbnail-scale', String(scale))
}

function thumbnailUrl(page: number): string {
  return `${props.previewUrl}#slide=${page}&mode=thumbnail`
}
</script>

<style scoped>
.slide-sidebar {
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-color: transparent transparent;
}

.slide-sidebar::-webkit-scrollbar-thumb {
  background: transparent;
}

.slide-sidebar:hover {
  scrollbar-color: var(--ui-scrollbar-thumb) transparent;
}

.slide-sidebar:hover::-webkit-scrollbar-thumb {
  background: var(--ui-scrollbar-thumb);
}

.slide-sidebar:hover::-webkit-scrollbar-thumb:hover {
  background: var(--ui-scrollbar-thumb-hover);
}

@supports selector(::-webkit-scrollbar) {
  .slide-sidebar,
  .slide-sidebar:hover {
    scrollbar-color: auto;
  }
}

.slide-sidebar__list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 14px 12px 18px;
  list-style: none;
}

.slide-sidebar__item {
  display: grid;
  width: 100%;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: start;
  gap: 6px;
  border: 0;
  padding: 0;
  color: var(--ui-text-color-secondary);
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.slide-sidebar__number {
  padding-top: 5px;
  font-size: 11px;
  line-height: 1;
  text-align: center;
}

.slide-sidebar__thumbnail {
  position: relative;
  display: block;
  width: calc(100% - 4px);
  overflow: hidden;
  box-sizing: content-box;
  border: 2px solid transparent;
  border-radius: 5px;
  background: #ffffff;
  box-shadow: 0 1px 4px rgb(15 23 42 / 12%);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.slide-sidebar__item--active {
  color: var(--ui-color-primary);
}

.slide-sidebar__item:hover .slide-sidebar__thumbnail,
.slide-sidebar__item--active .slide-sidebar__thumbnail {
  border-color: var(--ui-color-primary-light-5);
}

.slide-sidebar__item--active .slide-sidebar__thumbnail {
  box-shadow: 0 0 0 1px var(--ui-color-primary-light-7);
}

.slide-sidebar__item:focus-visible {
  outline: 2px solid var(--ui-color-primary);
  outline-offset: 4px;
}

.slide-sidebar__frame {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  width: var(--slide-canvas-width);
  height: var(--slide-canvas-height);
  border: 0;
  pointer-events: none;
  transform: scale(var(--slide-thumbnail-scale, 0));
  transform-origin: top left;
}

.slide-sidebar__frame-mask {
  position: absolute;
  z-index: 1;
  inset: 0;
  background: transparent;
}

@media (prefers-reduced-motion: reduce) {
  .slide-sidebar__thumbnail {
    transition: none;
  }
}
</style>
