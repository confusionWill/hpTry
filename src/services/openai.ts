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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

export async function requestChatCompletion(params: {
  provider: Provider
  messages: ChatMessageParam[]
  tools?: ChatTool[]
  toolChoice?: 'auto' | 'none'
  signal?: AbortSignal
  timeoutMs?: number
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
        // temperature: 0.2,
      }),
    })
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

  const payload = (await response.json()) as ChatCompletionResponse

  if (!response.ok) {
    throw new Error(payload.error?.message ?? response.statusText)
  }

  const message = payload.choices?.[0]?.message

  if (!message) {
    throw new Error('Empty response')
  }

  return { message }
}
