<template>
  <RouterView />
  <UiToastHost />
  <UiConfirmHost />
</template>

<script setup lang="ts">
import UiConfirmHost from '@/components/ui/UiConfirmHost.vue'
import UiToastHost from '@/components/ui/UiToastHost.vue'
</script>
