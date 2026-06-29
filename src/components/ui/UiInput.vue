<template>
  <input
    class="ui-input"
    :disabled="disabled"
    :placeholder="placeholder"
    :type="type"
    :value="model"
    @input="handleInput"
  />
</template>

<script setup lang="ts">
const model = defineModel<string>({ required: true })

withDefaults(
  defineProps<{
    placeholder?: string
    type?: 'text' | 'password'
    disabled?: boolean
  }>(),
  {
    placeholder: '',
    type: 'text',
    disabled: false,
  },
)

function handleInput(event: Event) {
  model.value = (event.target as HTMLInputElement).value
}
</script>

<style scoped>
.ui-input {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--ui-border-color);
  border-radius: 7px;
  background: var(--ui-bg-color);
  color: var(--ui-text-color-primary);
  font: inherit;
  line-height: 1.4;
  padding: 7px 10px;
}

.ui-input:focus {
  border-color: var(--ui-color-primary);
  outline: 0;
}

.ui-input::placeholder {
  color: var(--ui-text-color-placeholder);
}

.ui-input:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}
</style>
