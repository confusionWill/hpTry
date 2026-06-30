export type MessageRole = 'system' | 'user' | 'assistant'
export type ToolRunStatus = 'running' | 'success' | 'error'

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

export interface ChatMessage {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: number
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
  createdAt: number
  updatedAt: number
}

export interface ToolRun {
  id: string
  conversationId: string
  toolCallId: string
  toolName: string
  status: ToolRunStatus
  input: string
  output: string
  error: string
  createdAt: number
  updatedAt: number
}

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
