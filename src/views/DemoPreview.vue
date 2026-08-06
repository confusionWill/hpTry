<template>
  <main class="demo-preview-page">
    <header class="demo-preview-page__header">
      <RouterLink class="demo-preview-page__back" to="/">
        <ChevronLeft :size="17" aria-hidden="true" />
        <span>{{ t('demo.back') }}</span>
      </RouterLink>
      <div class="demo-preview-page__title">
        <span class="demo-preview-page__badge">{{ t('demo.badge') }}</span>
        <strong>{{ store.activeDemoPreview?.project.name ?? t('demo.title') }}</strong>
      </div>
      <div id="demo-preview-fullscreen-control" class="demo-preview-page__fullscreen" />
    </header>

    <section v-if="loading" class="demo-preview-page__state">
      <UiEmpty :description="t('demo.loading')" :image-size="72" />
    </section>

    <section v-else-if="loadFailed" class="demo-preview-page__state">
      <UiEmpty :description="t('demo.loadFailed')" :image-size="72">
        <UiButton @click="loadCurrentCase">
          {{ t('demo.retry') }}
        </UiButton>
      </UiEmpty>
    </section>

    <div v-else class="demo-preview-page__content">
      <aside class="demo-preview-page__slides">
        <PresentationSlideSidebar
          v-if="presentationStore.manifest?.slides.length && presentationStore.previewUrl"
          :active-page="presentationStore.activeSlidePage"
          :canvas-size="presentationStore.selectedCanvasSize"
          :preview-url="presentationStore.previewUrl"
          :slides="presentationStore.manifest.slides"
          @select="presentationStore.selectSlide"
        />
      </aside>
      <section class="demo-preview-page__preview">
        <LivePreviewPanel
          fullscreen-control-target="#demo-preview-fullscreen-control"
          readonly
        />
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ChevronLeft } from '@lucide/vue'
import { onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

import LivePreviewPanel from '@/components/LivePreviewPanel.vue'
import PresentationSlideSidebar from '@/components/PresentationSlideSidebar.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiEmpty from '@/components/ui/UiEmpty.vue'
import { useAgentStore } from '@/stores/agent'
import { usePresentationStore } from '@/stores/presentation'

const route = useRoute()
const store = useAgentStore()
const presentationStore = usePresentationStore()
const { t } = useI18n()
const loading = ref(true)
const loadFailed = ref(false)
let loadSequence = 0
let storeLoadPromise: Promise<void> | null = null

function currentCaseId(): string {
  const value = route.params.caseId
  return typeof value === 'string' ? value : ''
}

function ensureStoreLoaded(): Promise<void> {
  storeLoadPromise ??= store.load()
  return storeLoadPromise
}

async function loadCurrentCase() {
  const sequence = loadSequence + 1
  loadSequence = sequence
  loading.value = true
  loadFailed.value = false

  try {
    await ensureStoreLoaded()
    const opened = await store.openDemoPreview(
      currentCaseId(),
      t('demo.builtIn.welcome.name'),
    )

    if (sequence !== loadSequence || !opened) {
      return
    }
  } catch {
    if (sequence === loadSequence) {
      loadFailed.value = true
    }
  } finally {
    if (sequence === loadSequence) {
      loading.value = false
    }
  }
}

watch(() => route.params.caseId, loadCurrentCase, { immediate: true })

onBeforeRouteLeave(async () => {
  loadSequence += 1
  await store.closeDemoPreview()
})

onUnmounted(() => {
  loadSequence += 1
  void store.closeDemoPreview()
})
</script>

<style scoped>
.demo-preview-page {
  display: grid;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  grid-template-rows: 52px minmax(0, 1fr);
  background: var(--ui-background2);
}

.demo-preview-page__header {
  z-index: 2;
  display: grid;
  min-width: 0;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--ui-border-color-light);
  background: var(--ui-bg-color);
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
}

.demo-preview-page__back {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 4px;
  color: var(--ui-text-color-secondary);
  font-size: 13px;
  text-decoration: none;
}

.demo-preview-page__back:hover {
  color: var(--ui-text-color-primary);
}

.demo-preview-page__title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.demo-preview-page__title strong {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demo-preview-page__badge {
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--ui-color-primary-light-9);
  color: var(--ui-color-primary);
  font-size: 11px;
  font-weight: 650;
}

.demo-preview-page__fullscreen {
  display: flex;
  align-items: center;
  justify-self: end;
}

.demo-preview-page__content {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-columns: 280px minmax(0, 1fr);
}

.demo-preview-page__slides {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--ui-border-color-light);
  background: var(--ui-background2);
}

.demo-preview-page__preview {
  display: grid;
  min-width: 0;
  min-height: 0;
}

.demo-preview-page__state {
  display: grid;
  min-width: 0;
  min-height: 0;
  place-items: center;
}

.demo-preview-page__state :deep(.ui-empty) {
  gap: 12px;
}

@media (max-width: 760px) {
  .demo-preview-page__header {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .demo-preview-page__title {
    justify-self: end;
  }

  .demo-preview-page__content {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-preview-page__slides {
    display: none;
  }
}
</style>
