<template>
  <div class="ui-empty">
    <Inbox :size="imageSize" stroke-width="1.5" />
    <p>{{ description }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { Inbox } from '@lucide/vue'

withDefaults(
  defineProps<{
    description: string
    imageSize?: number
  }>(),
  {
    imageSize: 64,
  },
)
</script>

<style scoped>
.ui-empty {
  display: grid;
  justify-items: center;
  gap: 8px;
  color: var(--ui-text-color-secondary);
  text-align: center;
}

.ui-empty p {
  margin: 0;
  color: var(--ui-text-color-secondary);
  font-size: 14px;
}
</style>
