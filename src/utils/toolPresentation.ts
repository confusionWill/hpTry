import {
  FilePenLine,
  FilePlus,
  FileText,
  FolderPen,
  FolderX,
  List,
  Pencil,
  Replace,
  Search,
  Trash2,
  Wrench,
} from '@lucide/vue'
import type { Component } from 'vue'
import type { ComposerTranslation } from 'vue-i18n'

import type { AgentToolName } from '@/services/agent/tools'
import type { ConversationToolEvent } from '@/types/agent'

interface ToolSummaryContext {
  input: Record<string, unknown>
  output: Record<string, unknown>
  t: ComposerTranslation
}

interface ToolPresentation {
  icon: Component
  summarize: (context: ToolSummaryContext) => string
}

function getString(value: Record<string, unknown>, key: string): string {
  const result = value[key]

  return typeof result === 'string' ? result : ''
}

function getNumber(value: Record<string, unknown>, key: string): number | undefined {
  const result = value[key]

  return typeof result === 'number' ? result : undefined
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  return `${(bytes / 1024).toFixed(1)} KB`
}

const toolPresentations: Record<AgentToolName, ToolPresentation> = {
  list_files: {
    icon: List,
    summarize: ({ output, t }) => {
      const files = Array.isArray(output.files) ? output.files.length : undefined
      return files === undefined
        ? t('conversation.toolSummary.listFiles')
        : t('conversation.toolSummary.listFilesWithCount', files)
    },
  },
  search_files: {
    icon: Search,
    summarize: ({ output, t }) => {
      const matches =
        getNumber(output, 'totalMatches') ??
        (Array.isArray(output.matches) ? output.matches.length : undefined)
      return matches === undefined
        ? t('conversation.toolSummary.searchFiles')
        : t('conversation.toolSummary.searchFilesWithCount', matches)
    },
  },
  read_files: {
    icon: FileText,
    summarize: ({ output, t }) => {
      const files = Array.isArray(output.files) ? output.files.length : undefined
      return files === undefined
        ? t('conversation.toolSummary.readFiles')
        : t('conversation.toolSummary.readFilesWithCount', files)
    },
  },
  write_file: {
    icon: FilePlus,
    summarize: ({ input, output, t }) => {
      const path = getString(input, 'path') || getString(output, 'path')
      const bytes = getNumber(output, 'bytes')

      if (path && bytes !== undefined) {
        return t('conversation.toolSummary.writeFileWithBytes', {
          path,
          bytes: formatBytes(bytes),
        })
      }

      return path
        ? t('conversation.toolSummary.writeFile', { path })
        : t('conversation.toolSummary.writeFileFallback')
    },
  },
  edit_file: {
    icon: Pencil,
    summarize: ({ input, output, t }) => {
      const path = getString(input, 'path') || getString(output, 'path')
      const bytes = getNumber(output, 'bytes')

      if (path && bytes !== undefined) {
        return t('conversation.toolSummary.editFileWithBytes', {
          path,
          bytes: formatBytes(bytes),
        })
      }

      return path
        ? t('conversation.toolSummary.editFile', { path })
        : t('conversation.toolSummary.editFileFallback')
    },
  },
  replace_in_file: {
    icon: Replace,
    summarize: ({ input, output, t }) => {
      const path = getString(input, 'path') || getString(output, 'path')
      const replacements = getNumber(output, 'replacements')

      if (path && replacements !== undefined) {
        return t(
          'conversation.toolSummary.replaceInFileWithCount',
          { path },
          replacements,
        )
      }

      return path
        ? t('conversation.toolSummary.replaceInFile', { path })
        : t('conversation.toolSummary.replaceInFileFallback')
    },
  },
  delete_file: {
    icon: Trash2,
    summarize: ({ input, output, t }) => {
      const path = getString(input, 'path') || getString(output, 'path')
      return path
        ? t('conversation.toolSummary.deleteFile', { path })
        : t('conversation.toolSummary.deleteFileFallback')
    },
  },
  rename_file: {
    icon: FilePenLine,
    summarize: ({ input, output, t }) => {
      const fromPath = getString(input, 'fromPath') || getString(output, 'fromPath')
      const toPath = getString(input, 'toPath') || getString(output, 'toPath')
      return fromPath && toPath
        ? t('conversation.toolSummary.renameFile', { fromPath, toPath })
        : t('conversation.toolSummary.renameFileFallback')
    },
  },
  delete_directory: {
    icon: FolderX,
    summarize: ({ input, output, t }) => {
      const path = getString(input, 'path') || getString(output, 'path')
      return path
        ? t('conversation.toolSummary.deleteDirectory', { path })
        : t('conversation.toolSummary.deleteDirectoryFallback')
    },
  },
  rename_directory: {
    icon: FolderPen,
    summarize: ({ input, output, t }) => {
      const fromPath = getString(input, 'fromPath') || getString(output, 'fromPath')
      const toPath = getString(input, 'toPath') || getString(output, 'toPath')
      return fromPath && toPath
        ? t('conversation.toolSummary.renameDirectory', { fromPath, toPath })
        : t('conversation.toolSummary.renameDirectoryFallback')
    },
  },
}

function parseToolPayload(payload: string): Record<string, unknown> {
  if (!payload) {
    return {}
  }

  try {
    const value: unknown = JSON.parse(payload)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function presentationForName(toolName: string): ToolPresentation | undefined {
  return toolPresentations[toolName as AgentToolName]
}

export function toolIconForName(toolName: string): Component {
  return presentationForName(toolName)?.icon ?? Wrench
}

export function summarizeToolEvent(
  tool: ConversationToolEvent,
  t: ComposerTranslation,
): string {
  if (tool.error) {
    return tool.error
  }

  const presentation = presentationForName(tool.toolName)

  if (!presentation) {
    return t('conversation.toolSummary.generic')
  }

  return presentation.summarize({
    input: parseToolPayload(tool.input),
    output: parseToolPayload(tool.output),
    t,
  })
}
