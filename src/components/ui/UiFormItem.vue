<template>
  <label class="ui-form-item">
    <span class="ui-form-item__label">
      {{ label }}
      <span v-if="required" class="ui-form-item__required" aria-hidden="true">*</span>
    </span>
    <slot />
  </label>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    required?: boolean
  }>(),
  {
    required: false,
  },
)
</script>

<style scoped>
.ui-form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.ui-form-item__label {
  color: var(--ui-text-color-primary);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
}

.ui-form-item__required {
  color: var(--ui-color-danger);
}
</style>
