import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import MarkdownIt from 'markdown-it'

function createMarkdown(enableHighlighting: boolean): MarkdownIt {
  const markdown = new MarkdownIt({
    breaks: true,
    html: false,
    linkify: false,
    typographer: true,
    highlight(code: string, language: string): string {
      const normalizedLanguage = language.trim()

      if (enableHighlighting && normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
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

  return markdown
}

const markdown = createMarkdown(true)
const streamingMarkdown = createMarkdown(false)

export function renderMarkdown(content: string, enableHighlighting = true): string {
  const renderer = enableHighlighting ? markdown : streamingMarkdown

  return DOMPurify.sanitize(renderer.render(content), {
    ADD_ATTR: ['target'],
  })
}
