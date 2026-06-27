import type { ChatMessage, Provider, WorkspaceFile } from '@/types/agent'

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

function buildFileContext(files: WorkspaceFile[]): string {
  if (files.length === 0) {
    return ''
  }

  return files
    .map((file) => `File: ${file.path}\n\`\`\`\n${file.content}\n\`\`\``)
    .join('\n\n')
}

export async function requestChatCompletion(params: {
  provider: Provider
  systemPrompt: string
  messages: ChatMessage[]
  files: WorkspaceFile[]
}): Promise<string> {
  const fileContext = buildFileContext(params.files)
  const messages: OpenAIMessage[] = [
    {
      role: 'system',
      content: fileContext
        ? `${params.systemPrompt}\n\nCurrent project files:\n\n${fileContext}`
        : params.systemPrompt,
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
