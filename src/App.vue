<template>
  <RouterView />
  <UiToastHost />
  <UiConfirmHost />
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import UiConfirmHost from '@/components/ui/UiConfirmHost.vue'
import UiToastHost from '@/components/ui/UiToastHost.vue'
import { useAgentStore } from '@/stores/agent'

const store = useAgentStore()
const { t } = useI18n()
const documentTitle = computed(() => store.selectedProject?.name.trim() || t('app.title'))

watch(
  documentTitle,
  (title) => {
    document.title = title
  },
  { immediate: true },
)
</script>
