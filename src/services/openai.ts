import type { ChatTool } from '@/services/agent/tools'
import type { Provider, ToolCall } from '@/types/agent'

export interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ChatCompletionMessage {
  role: 'assistant'
  content?: string | null
  tool_calls?: ToolCall[]
}

export interface ChatCompletionResult {
  message: ChatCompletionMessage
}

interface ChatCompletionToolCallDelta {
  index: number
  id?: string
  type?: 'function'
  function?: {
    name?: string
    arguments?: string
  }
}

interface ChatCompletionDelta {
  role?: 'assistant'
  content?: string | null
  tool_calls?: ChatCompletionToolCallDelta[]
}

interface ChatCompletionChunkChoice {
  delta?: ChatCompletionDelta
  finish_reason?: string | null
}

interface ChatCompletionChunk {
  choices?: ChatCompletionChunkChoice[]
  error?: {
    message?: string
  }
}

interface ChatCompletionChoice {
  message?: ChatCompletionMessage
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[]
  error?: {
    message?: string
  }
}

export type ChatCompletionRequestErrorCode = 'aborted' | 'timeout'

export class ChatCompletionRequestError extends Error {
  code: ChatCompletionRequestErrorCode

  constructor(code: ChatCompletionRequestErrorCode, message: string) {
    super(message)
    this.name = 'ChatCompletionRequestError'
    this.code = code
  }
}

export type ChatCompletionResponseErrorCode =
  | 'emptyResponse'
  | 'invalidStreamResponse'
  | 'invalidStreamingToolCall'
  | 'streamEndedUnexpectedly'
  | 'streamFailed'

export const CHAT_COMPLETION_RESPONSE_ERROR_I18N_KEYS: Record<
  ChatCompletionResponseErrorCode,
  string
> = {
  emptyResponse: 'provider.responseError.emptyResponse',
  invalidStreamResponse: 'provider.responseError.invalidStreamResponse',
  invalidStreamingToolCall: 'provider.responseError.invalidStreamingToolCall',
  streamEndedUnexpectedly: 'provider.responseError.streamEndedUnexpectedly',
  streamFailed: 'provider.responseError.streamFailed',
}

export class ChatCompletionResponseError extends Error {
  code: ChatCompletionResponseErrorCode

  constructor(code: ChatCompletionResponseErrorCode) {
    super(code)
    this.name = 'ChatCompletionResponseError'
    this.code = code
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function usesDeepSeekThinking(provider: Provider): boolean {
  try {
    return new URL(provider.baseUrl).hostname.toLowerCase() === 'api.deepseek.com'
  } catch {
    return false
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error !== null &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message
  }

  return fallback
}

async function readErrorResponse(response: Response): Promise<string> {
  const text = await response.text()

  if (!text) {
    return response.statusText
  }

  try {
    return getErrorMessage(JSON.parse(text), response.statusText)
  } catch {
    return text
  }
}

async function readChatCompletionStream(
  response: Response,
  onTextDelta?: (delta: string, content: string) => void,
): Promise<ChatCompletionResult> {
  if (!response.body) {
    throw new ChatCompletionResponseError('emptyResponse')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const dataLines: string[] = []
  const toolCallDeltas = new Map<
    number,
    {
      id: string
      name: string
      arguments: string
    }
  >()
  let buffer = ''
  let content = ''
  let done = false
  let streamCompleted = false

  const processEvent = () => {
    if (dataLines.length === 0 || done) {
      dataLines.length = 0
      return
    }

    const data = dataLines.join('\n')
    dataLines.length = 0

    if (data === '[DONE]') {
      streamCompleted = true
      done = true
      return
    }

    let chunk: ChatCompletionChunk

    try {
      chunk = JSON.parse(data) as ChatCompletionChunk
    } catch {
      throw new ChatCompletionResponseError('invalidStreamResponse')
    }

    if (chunk.error) {
      if (chunk.error.message) {
        throw new Error(chunk.error.message)
      }

      throw new ChatCompletionResponseError('streamFailed')
    }

    const choice = chunk.choices?.[0]

    if (choice?.finish_reason) {
      streamCompleted = true
    }

    const delta = choice?.delta

    if (!delta) {
      return
    }

    if (delta.content) {
      content += delta.content
      onTextDelta?.(delta.content, content)
    }

    for (const toolCall of delta.tool_calls ?? []) {
      const accumulated = toolCallDeltas.get(toolCall.index) ?? {
        id: '',
        name: '',
        arguments: '',
      }

      if (toolCall.id) {
        accumulated.id = toolCall.id
      }

      if (toolCall.function?.name) {
        accumulated.name += toolCall.function.name
      }

      if (toolCall.function?.arguments) {
        accumulated.arguments += toolCall.function.arguments
      }

      toolCallDeltas.set(toolCall.index, accumulated)
    }
  }

  const processLine = (line: string) => {
    const normalizedLine = line.endsWith('\r') ? line.slice(0, -1) : line

    if (!normalizedLine) {
      processEvent()
      return
    }

    if (normalizedLine.startsWith('data:')) {
      dataLines.push(normalizedLine.slice(5).trimStart())
    }
  }

  while (!done) {
    const { value, done: streamDone } = await reader.read()
    buffer += decoder.decode(value, { stream: !streamDone })

    let lineEnd = buffer.indexOf('\n')

    while (lineEnd >= 0) {
      processLine(buffer.slice(0, lineEnd))
      buffer = buffer.slice(lineEnd + 1)
      lineEnd = buffer.indexOf('\n')
    }

    if (streamDone) {
      if (buffer) {
        processLine(buffer)
      }
      processEvent()

      if (!streamCompleted) {
        throw new ChatCompletionResponseError('streamEndedUnexpectedly')
      }

      break
    }
  }

  const toolCalls = [...toolCallDeltas.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, toolCall]) => {
      if (!toolCall.id || !toolCall.name) {
        throw new ChatCompletionResponseError('invalidStreamingToolCall')
      }

      return {
        id: toolCall.id,
        type: 'function' as const,
        function: {
          name: toolCall.name,
          arguments: toolCall.arguments,
        },
      }
    })

  return {
    message: {
      role: 'assistant',
      content,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    },
  }
}

export async function requestChatCompletion(params: {
  provider: Provider
  messages: ChatMessageParam[]
  tools?: ChatTool[]
  toolChoice?: 'auto' | 'none'
  signal?: AbortSignal
  timeoutMs?: number
  onTextDelta?: (delta: string, content: string) => void
}): Promise<ChatCompletionResult> {
  const controller = new AbortController()
  const timeoutMs = params.timeoutMs ?? 120_000
  let timedOut = false
  const timeoutId = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abortRequest = () => controller.abort()

  if (params.signal?.aborted) {
    window.clearTimeout(timeoutId)
    throw new ChatCompletionRequestError('aborted', 'Request was canceled')
  }

  params.signal?.addEventListener('abort', abortRequest, { once: true })

  let response: Response

  try {
    response = await fetch(`${normalizeBaseUrl(params.provider.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: params.provider.model,
        messages: params.messages,
        tools: params.tools,
        tool_choice: params.tools ? (params.toolChoice ?? 'auto') : undefined,
        stream: true,
        thinking: usesDeepSeekThinking(params.provider) ? { type: 'disabled' } : undefined,
        // temperature: 0.2,
      }),
    })
  } catch (error) {
    window.clearTimeout(timeoutId)
    params.signal?.removeEventListener('abort', abortRequest)

    if (controller.signal.aborted) {
      throw new ChatCompletionRequestError(
        timedOut ? 'timeout' : 'aborted',
        timedOut ? 'Request timed out' : 'Request was canceled',
      )
    }

    throw error
  }

  try {
    if (!response.ok) {
      throw new Error(await readErrorResponse(response))
    }

    const contentType = response.headers.get('content-type') ?? ''

    if (contentType.includes('text/event-stream')) {
      return await readChatCompletionStream(response, params.onTextDelta)
    }

    const payload = (await response.json()) as ChatCompletionResponse
    const message = payload.choices?.[0]?.message

    if (!message) {
      if (payload.error?.message) {
        throw new Error(payload.error.message)
      }

      throw new ChatCompletionResponseError('emptyResponse')
    }

    if (message.content) {
      params.onTextDelta?.(message.content, message.content)
    }

    return { message }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ChatCompletionRequestError(
        timedOut ? 'timeout' : 'aborted',
        timedOut ? 'Request timed out' : 'Request was canceled',
      )
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
    params.signal?.removeEventListener('abort', abortRequest)
  }
}
