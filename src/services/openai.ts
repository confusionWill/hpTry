import type { ChatMessage, Provider } from '@/types/agent'

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionChoice {
  message?: {
    content?: string
  }
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
  systemPrompt: string
  messages: ChatMessage[]
}): Promise<string> {
  const messages: OpenAIMessage[] = [
    {
      role: 'system',
      content: params.systemPrompt,
    },
    ...params.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ]

  const response = await fetch(`${normalizeBaseUrl(params.provider.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.provider.model,
      messages,
      temperature: 0.2,
    }),
  })

  const payload = (await response.json()) as ChatCompletionResponse

  if (!response.ok) {
    throw new Error(payload.error?.message ?? response.statusText)
  }

  const content = payload.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('Empty response')
  }

  return content
}
