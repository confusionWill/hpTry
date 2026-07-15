import { executeBrowserAgentTool, hpTryTools } from '@/services/agent/tools'
import {
  ChatCompletionRequestError,
  requestChatCompletion,
  type ChatMessageParam,
} from '@/services/openai'
import type {
  Conversation,
  ConversationEvent,
  Project,
  Provider,
  ToolCall,
  ToolRun,
  WorkspaceFile,
} from '@/types/agent'

const MAX_AGENT_TOOL_ROUNDS = 50

export interface AgentRunContext {
  project: Project
  conversation: Conversation
  provider: Provider
  files: WorkspaceFile[]
  events: ConversationEvent[]
}

export interface AgentRunHandlers {
  createToolRun: (
    toolCall: ToolCall,
    stepSequence: number,
    reasoningContent?: string,
  ) => Promise<ToolRun>
  updateToolRun: (
    run: ToolRun,
    patch: Pick<ToolRun, 'status' | 'output' | 'error'>,
  ) => Promise<void>
  writeFile: (path: string, content: string) => Promise<WorkspaceFile>
  deleteFile: (path: string) => Promise<void>
  renameFile: (fromPath: string, toPath: string) => Promise<WorkspaceFile>
  deleteDirectory: (path: string) => Promise<number>
  renameDirectory: (fromPath: string, toPath: string) => Promise<WorkspaceFile[]>
}

export interface AgentConversationResult {
  content: string
  finalStepSequence: number
}

function toChatMessages(systemPrompt: string, events: ConversationEvent[]): ChatMessageParam[] {
  const messages: ChatMessageParam[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
  ]

  for (let eventIndex = 0; eventIndex < events.length; ) {
    const event = events[eventIndex]

    if (event.type === 'message') {
      messages.push({
        role: event.role,
        content: event.content,
      })
      eventIndex += 1
      continue
    }

    const toolStep: ToolRun[] = []
    let toolEventIndex = eventIndex

    while (toolEventIndex < events.length) {
      const toolEvent = events[toolEventIndex]

      if (
        toolEvent.type !== 'tool' ||
        toolEvent.turnId !== event.turnId ||
        toolEvent.stepSequence !== event.stepSequence
      ) {
        break
      }

      if (toolEvent.status !== 'running') {
        toolStep.push(toolEvent)
      }

      toolEventIndex += 1
    }

    eventIndex = toolEventIndex

    if (toolStep.length === 0) {
      continue
    }

    messages.push({
      role: 'assistant',
      content: null,
      reasoning_content: toolStep.find((tool) => tool.reasoningContent)?.reasoningContent,
      tool_calls: toolStep.map((tool) => ({
        id: tool.toolCallId,
        type: 'function',
        function: {
          name: tool.toolName,
          arguments: tool.input,
        },
      })),
    })

    for (const tool of toolStep) {
      messages.push({
        role: 'tool',
        tool_call_id: tool.toolCallId,
        content: buildToolResultContent(
          tool.status === 'success',
          tool.output,
          tool.error,
        ),
      })
    }
  }

  return messages
}

function buildToolResultContent(ok: boolean, output: string, error = ''): string {
  return JSON.stringify({
    ok,
    output,
    error,
  })
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new ChatCompletionRequestError('aborted', 'Request was canceled')
  }
}

async function executeToolCall(
  toolCall: ToolCall,
  stepSequence: number,
  reasoningContent: string | undefined,
  runContext: AgentRunContext,
  handlers: AgentRunHandlers,
  signal?: AbortSignal,
): Promise<ChatMessageParam> {
  throwIfAborted(signal)
  const run = await handlers.createToolRun(toolCall, stepSequence, reasoningContent)

  try {
    throwIfAborted(signal)
    const result = await executeBrowserAgentTool(toolCall, {
      project: runContext.project,
      conversationId: runContext.conversation.id,
      files: runContext.files,
      listFiles: () => runContext.files,
      readFile: (path) => runContext.files.find((file) => file.path === path),
      writeFile: handlers.writeFile,
      deleteFile: handlers.deleteFile,
      renameFile: handlers.renameFile,
      deleteDirectory: handlers.deleteDirectory,
      renameDirectory: handlers.renameDirectory,
    })

    throwIfAborted(signal)
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

    if (signal?.aborted) {
      await handlers.updateToolRun(run, {
        status: 'error',
        output: '',
        error: message,
      })
      throw new ChatCompletionRequestError('aborted', 'Request was canceled')
    }

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
  events: ConversationEvent[]
  runContext: AgentRunContext
  handlers: AgentRunHandlers
  signal?: AbortSignal
  onAssistantStream?: (content: string, stepSequence: number) => void
  onAssistantStreamReset?: () => void
}): Promise<AgentConversationResult> {
  const agentMessages = toChatMessages(params.systemPrompt, params.events)

  for (let round = 0; round < MAX_AGENT_TOOL_ROUNDS; round += 1) {
    const stepSequence = round + 1
    throwIfAborted(params.signal)
    const response = await requestChatCompletion({
      provider: params.runContext.provider,
      messages: agentMessages,
      tools: hpTryTools,
      signal: params.signal,
      onTextDelta: (_delta, content) => params.onAssistantStream?.(content, stepSequence),
    })
    throwIfAborted(params.signal)
    const toolCalls = response.message.tool_calls ?? []

    if (toolCalls.length === 0) {
      return {
        content: response.message.content?.trim() ?? '',
        finalStepSequence: stepSequence,
      }
    }

    params.onAssistantStreamReset?.()

    agentMessages.push({
      role: 'assistant',
      content: response.message.content ?? null,
      reasoning_content: response.message.reasoning_content,
      tool_calls: toolCalls,
    })

    for (const [toolCallIndex, toolCall] of toolCalls.entries()) {
      const toolMessage = await executeToolCall(
        toolCall,
        stepSequence,
        toolCallIndex === 0 ? (response.message.reasoning_content ?? undefined) : undefined,
        params.runContext,
        params.handlers,
        params.signal,
      )
      throwIfAborted(params.signal)
      agentMessages.push(toolMessage)
    }
  }

  return {
    content: '',
    finalStepSequence: MAX_AGENT_TOOL_ROUNDS,
  }
}

export async function generateConversationTitle(params: {
  provider: Provider
  titlePrompt: string
  userMessage: string
  signal?: AbortSignal
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
    signal: params.signal,
    timeoutMs: 30_000,
  })

  return response.message.content?.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '') ?? ''
}
