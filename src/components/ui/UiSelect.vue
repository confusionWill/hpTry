<template>
  <select class="ui-select" :value="model" @change="handleChange">
    <option value="" disabled>
      {{ placeholder }}
    </option>
    <option v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
</template>

<script setup lang="ts">
export interface UiSelectOption {
  label: string
  value: string
}

const model = defineModel<string>({ required: true })

defineProps<{
  options: UiSelectOption[]
  placeholder: string
}>()

const emit = defineEmits<{
  change: [value: string]
}>()

function handleChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  model.value = value
  emit('change', value)
}
</script>

<style scoped>
.ui-select {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--ui-border-color);
  border-radius: 7px;
  background: var(--ui-bg-color);
  color: var(--ui-text-color-primary);
  font: inherit;
  line-height: 1.4;
  padding: 6px 10px;
}

.ui-select:focus {
  border-color: var(--ui-color-primary);
  outline: 0;
}
</style>
