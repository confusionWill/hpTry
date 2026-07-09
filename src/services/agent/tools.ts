import type { Project, ToolCall, WorkspaceFile } from '@/types/agent'

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
}

export interface ToolExecutionResult {
  ok: boolean
  output: string
}

const MAX_FILE_BYTES = 120_000
const MAX_READ_FILES = 20
const DEFAULT_SEARCH_RESULTS = 50
const MAX_SEARCH_RESULTS = 100

export const hpTryTools: ChatTool[] = [
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
      name: 'search_files',
      description: 'Search text files in the current browser workspace project.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Text or regular expression pattern to search for.',
          },
          path: {
            type: 'string',
            description: 'Optional relative file or directory path to limit the search.',
          },
          useRegex: {
            type: 'boolean',
            description: 'When true, treat query as a JavaScript regular expression pattern.',
          },
          caseSensitive: {
            type: 'boolean',
            description: 'When false, match text case-insensitively. Defaults to true.',
          },
          maxResults: {
            type: 'number',
            description: `Maximum number of matches to return. Defaults to ${DEFAULT_SEARCH_RESULTS}, maximum ${MAX_SEARCH_RESULTS}.`,
          },
          offset: {
            type: 'number',
            description: 'Number of matches to skip before returning results. Defaults to 0.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_files',
      description: 'Read multiple files from the current browser workspace project.',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            description: 'Relative file paths to read, for example ["hp.html", "src/main.js"].',
            items: {
              type: 'string',
            },
          },
        },
        required: ['paths'],
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
      name: 'edit_file',
      description:
        'Patch one existing content file by replacing an exact oldContent segment with newContent. Use this for local edits instead of rewriting the whole file.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative file path, for example src/main.js.',
          },
          oldContent: {
            type: 'string',
            description: 'Exact content to replace. It must appear exactly once in the target file.',
          },
          newContent: {
            type: 'string',
            description: 'Replacement content.',
          },
        },
        required: ['path', 'oldContent', 'newContent'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_in_file',
      description:
        'Replace content in one existing text file by plain text or regular expression search.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative file path, for example src/main.js.',
          },
          query: {
            type: 'string',
            description: 'Text or regular expression pattern to replace.',
          },
          replacement: {
            type: 'string',
            description: 'Replacement content.',
          },
          useRegex: {
            type: 'boolean',
            description: 'When true, treat query as a JavaScript regular expression pattern.',
          },
          caseSensitive: {
            type: 'boolean',
            description: 'When false, match text case-insensitively. Defaults to true.',
          },
          replaceAll: {
            type: 'boolean',
            description: 'When true, replace all matches. Defaults to false.',
          },
        },
        required: ['path', 'query', 'replacement'],
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

function getOptionalString(value: unknown, name: string): string {
  if (!isRecord(value) || value[name] === undefined) {
    return ''
  }

  if (typeof value[name] !== 'string') {
    throw new Error(`Invalid ${name}`)
  }

  return value[name].trim()
}

function getOptionalBoolean(value: unknown, name: string): boolean {
  if (!isRecord(value) || value[name] === undefined) {
    return false
  }

  if (typeof value[name] !== 'boolean') {
    throw new Error(`Invalid ${name}`)
  }

  return value[name]
}

function getOptionalBooleanDefault(value: unknown, name: string, defaultValue: boolean): boolean {
  if (!isRecord(value) || value[name] === undefined) {
    return defaultValue
  }

  if (typeof value[name] !== 'boolean') {
    throw new Error(`Invalid ${name}`)
  }

  return value[name]
}

function getOptionalInteger(
  value: unknown,
  name: string,
  defaultValue: number,
  options: { min: number; max?: number },
): number {
  if (!isRecord(value) || value[name] === undefined) {
    return defaultValue
  }

  if (typeof value[name] !== 'number' || !Number.isInteger(value[name])) {
    throw new Error(`Invalid ${name}`)
  }

  const numberValue = value[name]

  if (numberValue < options.min) {
    throw new Error(`${name} must be at least ${options.min}`)
  }

  if (options.max !== undefined && numberValue > options.max) {
    throw new Error(`${name} must be at most ${options.max}`)
  }

  return numberValue
}

function getStringArray(value: unknown, name: string): string[] {
  if (!isRecord(value) || !Array.isArray(value[name])) {
    throw new Error(`Invalid ${name}`)
  }

  const strings = value[name]

  if (!strings.every((item) => typeof item === 'string')) {
    throw new Error(`Invalid ${name}`)
  }

  return strings
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

function isInSearchScope(filePath: string, scopePath: string): boolean {
  return !scopePath || filePath === scopePath || filePath.startsWith(`${scopePath}/`)
}

function workspaceFilePayload(file: WorkspaceFile): Record<string, unknown> {
  if (file.kind === 'asset') {
    return {
      path: file.path,
      kind: 'asset',
      name: file.name ?? file.path.split('/').pop() ?? file.path,
      mimeType: file.mimeType ?? 'application/octet-stream',
      bytes: file.size ?? 0,
      content: '',
      note: 'This is a binary workspace asset. Reference it by path instead of reading its raw content.',
    }
  }

  return {
    path: file.path,
    kind: file.kind ?? 'text',
    language: file.language,
    content: file.content,
  }
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
        output: JSON.stringify(workspaceFilePayload(file)),
      }
    }
    case 'search_files': {
      const query = getRawString(input, 'query')
      const scopeInput = getOptionalString(input, 'path')
      const scopePath = scopeInput ? normalizeWorkspacePath(scopeInput) : ''
      const useRegex = getOptionalBoolean(input, 'useRegex')
      const caseSensitive = getOptionalBooleanDefault(input, 'caseSensitive', true)
      const maxResults = getOptionalInteger(input, 'maxResults', DEFAULT_SEARCH_RESULTS, {
        min: 1,
        max: MAX_SEARCH_RESULTS,
      })
      const offset = getOptionalInteger(input, 'offset', 0, { min: 0 })

      if (!query) {
        throw new Error('query cannot be empty')
      }

      let regex: RegExp | undefined
      const normalizedQuery = caseSensitive ? query : query.toLowerCase()

      if (useRegex) {
        try {
          regex = new RegExp(query, caseSensitive ? 'g' : 'gi')
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid regular expression'
          throw new Error(message)
        }
      }

      const matches: Record<string, unknown>[] = []
      const textFiles = context
        .listFiles()
        .filter((file) => file.kind !== 'asset' && isInSearchScope(file.path, scopePath))

      for (const file of textFiles) {
        const lines = file.content.split(/\r\n|\n|\r/)

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          const line = lines[lineIndex]

          if (regex) {
            regex.lastIndex = 0
            let match = regex.exec(line)

            while (match) {
              matches.push({
                path: file.path,
                line: lineIndex + 1,
                column: match.index + 1,
                content: line,
                match: match[0],
              })

              if (match[0] === '') {
                regex.lastIndex += 1
              }

              match = regex.exec(line)
            }

            continue
          }

          let searchFrom = 0
          const searchableLine = caseSensitive ? line : line.toLowerCase()

          while (searchFrom <= line.length) {
            const columnIndex = searchableLine.indexOf(normalizedQuery, searchFrom)

            if (columnIndex === -1) {
              break
            }

            matches.push({
              path: file.path,
              line: lineIndex + 1,
              column: columnIndex + 1,
              content: line,
              match: line.slice(columnIndex, columnIndex + query.length),
            })

            searchFrom = columnIndex + query.length
          }
        }
      }

      const totalMatches = matches.length
      const pagedMatches = matches.slice(offset, offset + maxResults)
      const hasMore = offset + maxResults < totalMatches

      return {
        ok: true,
        output: JSON.stringify({
          query,
          path: scopePath,
          caseSensitive,
          useRegex,
          offset,
          maxResults,
          totalMatches,
          matches: pagedMatches,
          hasMore,
        }),
      }
    }
    case 'read_files': {
      const paths = getStringArray(input, 'paths').map((path) => normalizeWorkspacePath(path))

      if (paths.length === 0) {
        throw new Error('paths cannot be empty')
      }

      if (paths.length > MAX_READ_FILES) {
        throw new Error(`Cannot read more than ${MAX_READ_FILES} files at once`)
      }

      const uniquePaths = new Set(paths)

      if (uniquePaths.size !== paths.length) {
        throw new Error('Duplicate paths are not allowed')
      }

      const files = paths.map((path) => {
        const file = context.readFile(path)

        if (!file) {
          throw new Error(`File not found: ${path}`)
        }

        return workspaceFilePayload(file)
      })

      return {
        ok: true,
        output: JSON.stringify({ files }),
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
    case 'edit_file': {
      const path = normalizeWorkspacePath(getString(input, 'path'))
      const oldContent = getRawString(input, 'oldContent')
      const newContent = getRawString(input, 'newContent')
      const file = context.readFile(path)

      if (!file) {
        throw new Error(`File not found: ${path}`)
      }

      if (file.kind === 'asset') {
        throw new Error(`Cannot edit binary asset: ${path}`)
      }

      if (!oldContent) {
        throw new Error('oldContent cannot be empty')
      }

      const firstIndex = file.content.indexOf(oldContent)

      if (firstIndex === -1) {
        throw new Error(`oldContent was not found in ${path}`)
      }

      if (file.content.indexOf(oldContent, firstIndex + oldContent.length) !== -1) {
        throw new Error(`oldContent appears more than once in ${path}`)
      }

      const content =
        file.content.slice(0, firstIndex) +
        newContent +
        file.content.slice(firstIndex + oldContent.length)
      const byteLength = new Blob([content]).size

      if (byteLength > MAX_FILE_BYTES) {
        throw new Error('File content is too large')
      }

      const updatedFile = await context.writeFile(path, content)
      return {
        ok: true,
        output: JSON.stringify({
          path: updatedFile.path,
          language: updatedFile.language,
          bytes: byteLength,
          replacedBytes: new Blob([oldContent]).size,
        }),
      }
    }
    case 'replace_in_file': {
      const path = normalizeWorkspacePath(getString(input, 'path'))
      const query = getRawString(input, 'query')
      const replacement = getRawString(input, 'replacement')
      const useRegex = getOptionalBoolean(input, 'useRegex')
      const caseSensitive = getOptionalBooleanDefault(input, 'caseSensitive', true)
      const replaceAll = getOptionalBoolean(input, 'replaceAll')
      const file = context.readFile(path)

      if (!file) {
        throw new Error(`File not found: ${path}`)
      }

      if (file.kind === 'asset') {
        throw new Error(`Cannot replace content in binary asset: ${path}`)
      }

      if (!query) {
        throw new Error('query cannot be empty')
      }

      let content = file.content
      let replacements = 0

      if (useRegex) {
        let regex: RegExp

        try {
          regex = new RegExp(query, `${replaceAll ? 'g' : ''}${caseSensitive ? '' : 'i'}`)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid regular expression'
          throw new Error(message)
        }

        const countRegex = new RegExp(query, `g${caseSensitive ? '' : 'i'}`)
        let match = countRegex.exec(file.content)

        while (match) {
          replacements += 1

          if (!replaceAll) {
            break
          }

          if (match[0] === '') {
            countRegex.lastIndex += 1
          }

          match = countRegex.exec(file.content)
        }

        content = file.content.replace(regex, replacement)
      } else {
        const searchableContent = caseSensitive ? file.content : file.content.toLowerCase()
        const searchableQuery = caseSensitive ? query : query.toLowerCase()
        const parts: string[] = []
        let cursor = 0
        let searchFrom = 0

        while (searchFrom <= searchableContent.length) {
          const matchIndex = searchableContent.indexOf(searchableQuery, searchFrom)

          if (matchIndex === -1) {
            break
          }

          parts.push(file.content.slice(cursor, matchIndex), replacement)
          replacements += 1
          cursor = matchIndex + query.length
          searchFrom = cursor

          if (!replaceAll) {
            break
          }
        }

        if (replacements > 0) {
          parts.push(file.content.slice(cursor))
          content = parts.join('')
        }
      }

      if (replacements === 0) {
        throw new Error(`query was not found in ${path}`)
      }

      const byteLength = new Blob([content]).size

      if (byteLength > MAX_FILE_BYTES) {
        throw new Error('File content is too large')
      }

      const updatedFile = await context.writeFile(path, content)
      return {
        ok: true,
        output: JSON.stringify({
          path: updatedFile.path,
          language: updatedFile.language,
          bytes: byteLength,
          replacements,
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
            kind: file.kind ?? 'text',
            mimeType: file.mimeType,
            bytes: file.size ?? new Blob([file.content]).size,
          })),
        }),
      }
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}
