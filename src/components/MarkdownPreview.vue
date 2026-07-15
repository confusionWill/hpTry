<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown-preview" v-html="renderedHtml" />
</template>

<script setup lang="ts">
import 'highlight.js/styles/github.css'
import { computed } from 'vue'

import { renderMarkdown } from '@/utils/markdown'

interface Props {
  content: string
  streaming?: boolean
}

const props = defineProps<Props>()

const renderedHtml = computed(() => renderMarkdown(props.content, !props.streaming))
</script>

<style scoped>
.markdown-preview {
  min-width: 0;
  overflow-wrap: anywhere;
  color: inherit;
  font-size: 14px;
  line-height: 1.65;
}

.markdown-preview :deep(*) {
  max-width: 100%;
}

.markdown-preview :deep(*:first-child) {
  margin-top: 0;
}

.markdown-preview :deep(*:last-child) {
  margin-bottom: 0;
}

.markdown-preview :deep(p),
.markdown-preview :deep(ul),
.markdown-preview :deep(ol),
.markdown-preview :deep(blockquote),
.markdown-preview :deep(pre),
.markdown-preview :deep(table) {
  margin: 0 0 10px;
}

.markdown-preview :deep(h1),
.markdown-preview :deep(h2),
.markdown-preview :deep(h3),
.markdown-preview :deep(h4),
.markdown-preview :deep(h5),
.markdown-preview :deep(h6) {
  margin: 14px 0 8px;
  font-weight: 650;
  line-height: 1.35;
}

.markdown-preview :deep(h1) {
  font-size: 20px;
}

.markdown-preview :deep(h2) {
  font-size: 18px;
}

.markdown-preview :deep(h3) {
  font-size: 16px;
}

.markdown-preview :deep(h4),
.markdown-preview :deep(h5),
.markdown-preview :deep(h6) {
  font-size: 14px;
}

.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
  padding-left: 22px;
}

.markdown-preview :deep(li + li) {
  margin-top: 4px;
}

.markdown-preview :deep(a) {
  color: var(--ui-color-primary);
  text-decoration: none;
}

.markdown-preview :deep(a:hover) {
  text-decoration: underline;
}

.markdown-preview :deep(blockquote) {
  border-left: 3px solid var(--ui-border-color);
  padding-left: 12px;
  color: var(--ui-text-color-secondary);
}

.markdown-preview :deep(code) {
  border-radius: 4px;
  background: var(--ui-fill-color-light);
  padding: 2px 5px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.92em;
}

.markdown-preview :deep(pre) {
  overflow: auto;
  border: 1px solid var(--ui-border-color-light);
  border-radius: 8px;
  background: var(--ui-fill-color-light);
  padding: 12px;
}

.markdown-preview :deep(pre code) {
  display: block;
  overflow: visible;
  background: transparent;
  padding: 0;
  white-space: pre;
}

.markdown-preview :deep(table) {
  display: block;
  overflow-x: auto;
  border-collapse: collapse;
}

.markdown-preview :deep(th),
.markdown-preview :deep(td) {
  border: 1px solid var(--ui-border-color-light);
  padding: 6px 8px;
  text-align: left;
}

.markdown-preview :deep(th) {
  background: var(--ui-fill-color-light);
  font-weight: 650;
}
</style>
