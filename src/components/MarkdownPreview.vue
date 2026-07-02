<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown-preview" v-html="renderedHtml" />
</template>

<script setup lang="ts">
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/github.css'
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'

interface Props {
  content: string
}

const props = defineProps<Props>()

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: false,
  typographer: true,
  highlight(code: string, language: string): string {
    const normalizedLanguage = language.trim()

    if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
      try {
        return hljs.highlight(code, { language: normalizedLanguage }).value
      } catch {
        return markdown.utils.escapeHtml(code)
      }
    }

    return markdown.utils.escapeHtml(code)
  },
})

const defaultLinkOpen =
  markdown.renderer.rules.link_open ??
  ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))

markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index]
  const targetIndex = token.attrIndex('target')
  const relIndex = token.attrIndex('rel')

  if (targetIndex < 0) {
    token.attrPush(['target', '_blank'])
  } else {
    token.attrs![targetIndex][1] = '_blank'
  }

  if (relIndex < 0) {
    token.attrPush(['rel', 'noopener noreferrer'])
  } else {
    token.attrs![relIndex][1] = 'noopener noreferrer'
  }

  return defaultLinkOpen(tokens, index, options, env, self)
}

const renderedHtml = computed(() =>
  DOMPurify.sanitize(markdown.render(props.content), {
    ADD_ATTR: ['target'],
  }),
)
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
