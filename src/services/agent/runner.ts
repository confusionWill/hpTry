import { executeBrowserAgentTool, hpWillTools } from '@/services/agent/tools'
import { requestChatCompletion, type ChatMessageParam } from '@/services/openai'
import type {
  ChatMessage,
  Conversation,
  Project,
  Provider,
  ToolCall,
  ToolRun,
  WorkspaceFile,
} from '@/types/agent'

const MAX_AGENT_TOOL_ROUNDS = 8

export interface AgentRunContext {
  project: Project
  conversation: Conversation
  provider: Provider
  files: WorkspaceFile[]
  toolRuns: ToolRun[]
}

export interface AgentRunHandlers {
  createToolRun: (toolCall: ToolCall) => Promise<ToolRun>
  updateToolRun: (
    run: ToolRun,
    patch: Pick<ToolRun, 'status' | 'output' | 'error'>,
  ) => Promise<void>
  writeFile: (path: string, content: string) => Promise<WorkspaceFile>
  deleteFile: (path: string) => Promise<void>
  renameFile: (fromPath: string, toPath: string) => Promise<WorkspaceFile>
}

function toChatMessages(systemPrompt: string, messages: ChatMessage[]): ChatMessageParam[] {
  return [
    {
      role: 'system',
      content: systemPrompt,
    },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ]
}

function buildToolResultContent(ok: boolean, output: string, error = ''): string {
  return JSON.stringify({
    ok,
    output,
    error,
  })
}

async function executeToolCall(
  toolCall: ToolCall,
  runContext: AgentRunContext,
  handlers: AgentRunHandlers,
): Promise<ChatMessageParam> {
  const run = await handlers.createToolRun(toolCall)

  try {
    const result = await executeBrowserAgentTool(toolCall, {
      project: runContext.project,
      conversationId: runContext.conversation.id,
      files: runContext.files,
      listFiles: () => runContext.files,
      readFile: (path) => runContext.files.find((file) => file.path === path),
      writeFile: handlers.writeFile,
      deleteFile: handlers.deleteFile,
      renameFile: handlers.renameFile,
      recentToolRuns: () => runContext.toolRuns,
    })

    await handlers.updateToolRun(run, {
      status: 'success',
      output: result.output,
      error: '',
    })

    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: buildToolResultContent(true, result.output),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool execution failed'

    await handlers.updateToolRun(run, {
      status: 'error',
      output: '',
      error: message,
    })

    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: buildToolResultContent(false, '', message),
    }
  }
}

export async function runAgentConversation(params: {
  systemPrompt: string
  messages: ChatMessage[]
  runContext: AgentRunContext
  handlers: AgentRunHandlers
}): Promise<string> {
  const agentMessages = toChatMessages(params.systemPrompt, params.messages)

  for (let round = 0; round < MAX_AGENT_TOOL_ROUNDS; round += 1) {
    const response = await requestChatCompletion({
      provider: params.runContext.provider,
      messages: agentMessages,
      tools: hpWillTools,
      toolChoice: 'auto',
    })
    const toolCalls = response.message.tool_calls ?? []

    if (toolCalls.length === 0) {
      return response.message.content?.trim() ?? ''
    }

    agentMessages.push({
      role: 'assistant',
      content: response.message.content ?? null,
      tool_calls: toolCalls,
    })

    for (const toolCall of toolCalls) {
      const toolMessage = await executeToolCall(toolCall, params.runContext, params.handlers)
      agentMessages.push(toolMessage)
    }
  }

  return ''
}

export async function generateConversationTitle(params: {
  provider: Provider
  titlePrompt: string
  userMessage: string
}): Promise<string> {
  const response = await requestChatCompletion({
    provider: params.provider,
    messages: [
      {
        role: 'system',
        content: params.titlePrompt,
      },
      {
        role: 'user',
        content: params.userMessage,
      },
    ],
    toolChoice: 'none',
  })

  return response.message.content?.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '') ?? ''
}
