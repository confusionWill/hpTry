export type MessageRole = 'system' | 'user' | 'assistant'

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
}

export interface WorkspaceFile {
  id: string
  projectId: string
  path: string
  content: string
  createdAt: number
  updatedAt: number
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

export interface ProjectPayload {
  name: string
  description: string
}

export interface ConversationPayload {
  projectId: string
  title: string
}

export interface FilePayload {
  projectId: string
  path: string
  content: string
}
