import type { Project, ToolCall, ToolRun, WorkspaceFile } from '@/types/agent'

export interface ChatTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
      additionalProperties: boolean
    }
  }
}

export interface ToolExecutionContext {
  project: Project
  conversationId: string
  files: WorkspaceFile[]
  listFiles: () => WorkspaceFile[]
  readFile: (path: string) => WorkspaceFile | undefined
  writeFile: (path: string, content: string) => Promise<WorkspaceFile>
  deleteFile: (path: string) => Promise<void>
  renameFile: (fromPath: string, toPath: string) => Promise<WorkspaceFile>
  recentToolRuns: () => ToolRun[]
}

export interface ToolExecutionResult {
  ok: boolean
  output: string
}

const MAX_FILE_BYTES = 120_000

export const hpWillTools: ChatTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List all files in the current browser workspace project.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read one file from the current browser workspace project.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative file path, for example src/main.js.',
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite one file in the current browser workspace project.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative file path, for example src/main.js.',
          },
          content: {
            type: 'string',
            description: 'Complete file content.',
          },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete one file from the current browser workspace project.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative file path to delete.',
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description: 'Rename one file in the current browser workspace project.',
      parameters: {
        type: 'object',
        properties: {
          fromPath: {
            type: 'string',
            description: 'Current relative file path.',
          },
          toPath: {
            type: 'string',
            description: 'New relative file path.',
          },
        },
        required: ['fromPath', 'toPath'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspect_project',
      description: 'Inspect the current project, files, and recent tool runs.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(value: unknown, name: string): string {
  if (!isRecord(value) || typeof value[name] !== 'string') {
    throw new Error(`Invalid ${name}`)
  }

  return value[name].trim()
}

function getRawString(value: unknown, name: string): string {
  if (!isRecord(value) || typeof value[name] !== 'string') {
    throw new Error(`Invalid ${name}`)
  }

  return value[name]
}

export function normalizeWorkspacePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\/+/, '').trim()
  const parts = normalized.split('/').filter(Boolean)

  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) {
    throw new Error('Invalid file path')
  }

  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Parent paths are not allowed')
  }

  if (normalized.length > 180) {
    throw new Error('File path is too long')
  }

  return parts.join('/')
}

function detectLanguage(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase()

  switch (extension) {
    case 'html':
      return 'html'
    case 'css':
      return 'css'
    case 'js':
    case 'mjs':
      return 'javascript'
    case 'json':
      return 'json'
    case 'md':
      return 'markdown'
    case 'ts':
      return 'typescript'
    default:
      return 'text'
  }
}

export function languageForPath(path: string): string {
  return detectLanguage(path)
}

export async function executeBrowserAgentTool(
  toolCall: ToolCall,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  const toolName = toolCall.function.name
  let input: unknown

  try {
    input = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {}
  } catch {
    throw new Error('Tool arguments must be valid JSON')
  }

  switch (toolName) {
    case 'list_files': {
      const files = context.listFiles().map((file) => file.path)
      return {
        ok: true,
        output: JSON.stringify({ files }),
      }
    }
    case 'read_file': {
      const path = normalizeWorkspacePath(getString(input, 'path'))
      const file = context.readFile(path)

      if (!file) {
        throw new Error(`File not found: ${path}`)
      }

      return {
        ok: true,
        output: JSON.stringify({
          path: file.path,
          language: file.language,
          content: file.content,
        }),
      }
    }
    case 'write_file': {
      const path = normalizeWorkspacePath(getString(input, 'path'))
      const content = getRawString(input, 'content')
      const byteLength = new Blob([content]).size

      if (byteLength > MAX_FILE_BYTES) {
        throw new Error('File content is too large')
      }

      const file = await context.writeFile(path, content)
      return {
        ok: true,
        output: JSON.stringify({
          path: file.path,
          language: file.language,
          bytes: byteLength,
        }),
      }
    }
    case 'delete_file': {
      const path = normalizeWorkspacePath(getString(input, 'path'))
      await context.deleteFile(path)
      return {
        ok: true,
        output: JSON.stringify({ path }),
      }
    }
    case 'rename_file': {
      const fromPath = normalizeWorkspacePath(getString(input, 'fromPath'))
      const toPath = normalizeWorkspacePath(getString(input, 'toPath'))
      const file = await context.renameFile(fromPath, toPath)
      return {
        ok: true,
        output: JSON.stringify({
          fromPath,
          toPath: file.path,
        }),
      }
    }
    case 'inspect_project': {
      return {
        ok: true,
        output: JSON.stringify({
          project: {
            name: context.project.name,
            description: context.project.description,
          },
          files: context.listFiles().map((file) => ({
            path: file.path,
            language: file.language,
            bytes: new Blob([file.content]).size,
          })),
          recentToolRuns: context.recentToolRuns().slice(-8).map((run) => ({
            toolName: run.toolName,
            status: run.status,
            output: run.output,
            error: run.error,
          })),
        }),
      }
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}
