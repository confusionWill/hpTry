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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

export async function requestChatCompletion(params: {
  provider: Provider
  messages: ChatMessageParam[]
  tools?: ChatTool[]
  toolChoice?: 'auto' | 'none'
}): Promise<ChatCompletionResult> {
  const response = await fetch(`${normalizeBaseUrl(params.provider.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.provider.model,
      messages: params.messages,
      tools: params.tools,
      tool_choice: params.tools ? (params.toolChoice ?? 'auto') : undefined,
      // temperature: 0.2,
    }),
  })

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
