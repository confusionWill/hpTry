<template>
  <textarea
    ref="textareaRef"
    class="ui-textarea"
    :disabled="disabled"
    :placeholder="placeholder"
    :rows="minRows"
    :value="model"
    @input="handleInput"
  />
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const model = defineModel<string>({ required: true })

const props = withDefaults(
  defineProps<{
    placeholder?: string
    disabled?: boolean
    minRows?: number
    maxRows?: number
    autosize?: boolean
  }>(),
  {
    placeholder: '',
    disabled: false,
    minRows: 2,
    maxRows: 6,
    autosize: false,
  },
)

const textareaRef = ref<HTMLTextAreaElement | null>(null)

function resizeTextarea() {
  if (!props.autosize || !textareaRef.value) {
    return
  }

  const textarea = textareaRef.value
  const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight)
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, lineHeight * props.maxRows + 16)}px`
}

function handleInput(event: Event) {
  model.value = (event.target as HTMLTextAreaElement).value
  void nextTick(resizeTextarea)
}

function focus() {
  textareaRef.value?.focus()
}

defineExpose({
  focus,
})

watch(
  () => model.value,
  () => {
    void nextTick(resizeTextarea)
  },
  { immediate: true },
)
</script>

<style scoped>
.ui-textarea {
  width: 100%;
  min-height: 68px;
  border: 1px solid var(--ui-border-color);
  border-radius: 7px;
  background: var(--ui-bg-color);
  color: var(--ui-text-color-primary);
  font: inherit;
  line-height: 1.5;
  padding: 8px 10px;
  resize: none;
}

.ui-textarea:focus {
  border-color: var(--ui-color-primary);
  outline: 0;
}

.ui-textarea::placeholder {
  color: var(--ui-text-color-placeholder);
}

.ui-textarea:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}
</style>
