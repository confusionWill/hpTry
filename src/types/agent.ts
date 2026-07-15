export type MessageRole = 'system' | 'user' | 'assistant'
export type ToolRunStatus = 'running' | 'success' | 'error'
export type ConversationTurnStatus = 'running' | 'completed' | 'error' | 'stopped'
export type ConversationEventType = 'message' | 'tool'

export interface Project {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
}

export interface Conversation {
  id: string
  projectId: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface ConversationTurn {
  id: string
  conversationId: string
  sequence: number
  status: ConversationTurnStatus
  createdAt: number
  updatedAt: number
  completedAt?: number
  responseDurationMs?: number
}

interface BaseConversationEvent {
  id: string
  conversationId: string
  turnId: string
  sequence: number
  stepSequence: number
  createdAt: number
  updatedAt: number
}

export interface ConversationMessageEvent extends BaseConversationEvent {
  type: 'message'
  role: MessageRole
  content: string
  responseDurationMs?: number
}

export interface Provider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  createdAt: number
  updatedAt: number
}

export interface ProviderPayload {
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

export interface WorkspaceFile {
  id: string
  projectId: string
  path: string
  content: string
  language: string
  kind?: 'text' | 'asset'
  assetId?: string
  name?: string
  mimeType?: string
  size?: number
  createdAt: number
  updatedAt: number
}

export interface WorkspaceAsset {
  id: string
  projectId: string
  path: string
  name: string
  mimeType: string
  size: number
  blob: Blob
  createdAt: number
  updatedAt: number
}

export interface ConversationToolEvent extends BaseConversationEvent {
  type: 'tool'
  toolCallId: string
  toolName: string
  status: ToolRunStatus
  input: string
  output: string
  error: string
}

export type ConversationEvent = ConversationMessageEvent | ConversationToolEvent
export type ChatMessage = ConversationMessageEvent
export type ToolRun = ConversationToolEvent

export interface ToolFunctionCall {
  name: string
  arguments: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: ToolFunctionCall
}

export interface ProjectPayload {
  name: string
  description: string
}
