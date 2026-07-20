<template>
  <component
    :is="toolIconForName(toolName)"
    class="tool-event-icon"
    :class="`tool-event-icon--${status}`"
    :size="16"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import type { ToolRunStatus } from '@/types/agent'
import { toolIconForName } from '@/utils/toolPresentation'

defineProps<{
  toolName: string
  status: ToolRunStatus
}>()
</script>

<style scoped>
.tool-event-icon {
  flex: 0 0 auto;
  color: var(--ui-text-color-primary);
}

.tool-event-icon--running {
  animation: tool-event-icon-running 1s ease-in-out infinite alternate;
}

.tool-event-icon--error {
  color: #dc2626;
}

@keyframes tool-event-icon-running {
  from {
    color: var(--ui-text-color-primary);
  }

  to {
    color: var(--ui-text-color-placeholder);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tool-event-icon--running {
    animation: none;
    color: var(--ui-text-color-placeholder);
  }
}
</style>
