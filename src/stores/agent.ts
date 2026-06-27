import { defineStore } from 'pinia'

import {
  deleteRecord,
  deleteRecordsByIndex,
  getAllRecords,
  getRecordsByIndex,
  putRecord,
} from '@/services/db'
import { requestChatCompletion } from '@/services/openai'
import type {
  ChatMessage,
  Conversation,
  ConversationPayload,
  FilePayload,
  Project,
  ProjectPayload,
  Provider,
  ProviderPayload,
  WorkspaceFile,
} from '@/types/agent'

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function now(): number {
  return Date.now()
}

function sortUpdated<T extends { updatedAt: number }>(records: T[]): T[] {
  return [...records].sort((a, b) => b.updatedAt - a.updatedAt)
}

function sortCreated<T extends { createdAt: number }>(records: T[]): T[] {
  return [...records].sort((a, b) => a.createdAt - b.createdAt)
}

export const useAgentStore = defineStore('agent', {
  state: () => ({
    projects: [] as Project[],
    conversations: [] as Conversation[],
    messages: [] as ChatMessage[],
    files: [] as WorkspaceFile[],
    providers: [] as Provider[],
    selectedProjectId: '',
    selectedConversationId: '',
    selectedFileId: '',
    selectedProviderId: '',
    loading: false,
    sending: false,
  }),
  getters: {
    selectedProject(state): Project | undefined {
      return state.projects.find((project) => project.id === state.selectedProjectId)
    },
    selectedConversation(state): Conversation | undefined {
      return state.conversations.find(
        (conversation) => conversation.id === state.selectedConversationId,
      )
    },
    selectedProvider(state): Provider | undefined {
      return state.providers.find((provider) => provider.id === state.selectedProviderId)
    },
    selectedFile(state): WorkspaceFile | undefined {
      return state.files.find((file) => file.id === state.selectedFileId)
    },
  },
  actions: {
    async load() {
      this.loading = true
      try {
        this.projects = sortUpdated(await getAllRecords('projects'))
        this.providers = sortUpdated(await getAllRecords('providers'))

        if (!this.selectedProjectId && this.projects[0]) {
          this.selectedProjectId = this.projects[0].id
        }

        if (!this.selectedProviderId && this.providers[0]) {
          this.selectedProviderId = this.providers[0].id
        }

        if (this.selectedProjectId) {
          await this.selectProject(this.selectedProjectId)
        }
      } finally {
        this.loading = false
      }
    },
    async selectProject(projectId: string) {
      this.selectedProjectId = projectId
      this.conversations = sortUpdated(
        await getRecordsByIndex('conversations', 'projectId', projectId),
      )
      this.files = sortCreated(await getRecordsByIndex('files', 'projectId', projectId))
      this.selectedConversationId = this.conversations[0]?.id ?? ''
      this.selectedFileId = this.files[0]?.id ?? ''
      this.messages = []

      if (this.selectedConversationId) {
        await this.selectConversation(this.selectedConversationId)
      }
    },
    async createProject(payload: ProjectPayload) {
      const timestamp = now()
      const project: Project = {
        id: createId('project'),
        name: payload.name.trim(),
        description: payload.description.trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      await putRecord('projects', project)
      this.projects = sortUpdated([...this.projects, project])
      await this.selectProject(project.id)
    },
    async deleteProject(projectId: string) {
      const conversations = await getRecordsByIndex('conversations', 'projectId', projectId)

      await Promise.all(
        conversations.map((conversation) =>
          deleteRecordsByIndex('messages', 'conversationId', conversation.id),
        ),
      )
      await deleteRecordsByIndex('conversations', 'projectId', projectId)
      await deleteRecordsByIndex('files', 'projectId', projectId)
      await deleteRecord('projects', projectId)

      this.projects = this.projects.filter((project) => project.id !== projectId)
      this.selectedProjectId = this.projects[0]?.id ?? ''

      if (this.selectedProjectId) {
        await this.selectProject(this.selectedProjectId)
      } else {
        this.conversations = []
        this.messages = []
        this.files = []
        this.selectedConversationId = ''
        this.selectedFileId = ''
      }
    },
    async createConversation(payload: ConversationPayload) {
      const timestamp = now()
      const conversation: Conversation = {
        id: createId('conversation'),
        projectId: payload.projectId,
        title: payload.title.trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      await putRecord('conversations', conversation)
      this.conversations = sortUpdated([...this.conversations, conversation])
      await this.selectConversation(conversation.id)
    },
    async selectConversation(conversationId: string) {
      this.selectedConversationId = conversationId
      this.messages = sortCreated(
        await getRecordsByIndex('messages', 'conversationId', conversationId),
      )
    },
    async deleteConversation(conversationId: string) {
      await deleteRecordsByIndex('messages', 'conversationId', conversationId)
      await deleteRecord('conversations', conversationId)
      this.conversations = this.conversations.filter(
        (conversation) => conversation.id !== conversationId,
      )
      this.selectedConversationId = this.conversations[0]?.id ?? ''
      this.messages = []

      if (this.selectedConversationId) {
        await this.selectConversation(this.selectedConversationId)
      }
    },
    async saveFile(payload: FilePayload) {
      const timestamp = now()
      const trimmedPath = payload.path.trim()
      const selectedFile = this.files.find((file) => file.id === this.selectedFileId)
      const existing = selectedFile ?? this.files.find((file) => file.path === trimmedPath)
      const file: WorkspaceFile = {
        id: existing?.id ?? createId('file'),
        projectId: payload.projectId,
        path: trimmedPath,
        content: payload.content,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }

      await putRecord('files', file)
      this.files = sortCreated([...this.files.filter((item) => item.id !== file.id), file])
      this.selectedFileId = file.id
    },
    async selectFile(fileId: string) {
      this.selectedFileId = fileId
    },
    async deleteFile(fileId: string) {
      await deleteRecord('files', fileId)
      this.files = this.files.filter((file) => file.id !== fileId)
      this.selectedFileId = this.files[0]?.id ?? ''
    },
    async saveProvider(payload: ProviderPayload, providerId?: string) {
      const timestamp = now()
      const existing = this.providers.find((provider) => provider.id === providerId)
      const provider: Provider = {
        id: existing?.id ?? createId('provider'),
        name: payload.name.trim(),
        baseUrl: payload.baseUrl.trim(),
        apiKey: payload.apiKey.trim(),
        model: payload.model.trim(),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }

      await putRecord('providers', provider)
      this.providers = sortUpdated([
        ...this.providers.filter((item) => item.id !== provider.id),
        provider,
      ])
      this.selectedProviderId = provider.id
    },
    async deleteProvider(providerId: string) {
      await deleteRecord('providers', providerId)
      this.providers = this.providers.filter((provider) => provider.id !== providerId)
      this.selectedProviderId = this.providers[0]?.id ?? ''
    },
    async sendMessage(content: string, systemPrompt: string) {
      if (!this.selectedConversationId || !this.selectedProvider) {
        return
      }

      this.sending = true
      const timestamp = now()
      const userMessage: ChatMessage = {
        id: createId('message'),
        conversationId: this.selectedConversationId,
        role: 'user',
        content,
        createdAt: timestamp,
      }

      await putRecord('messages', userMessage)
      this.messages = [...this.messages, userMessage]

      try {
        const response = await requestChatCompletion({
          provider: this.selectedProvider,
          systemPrompt,
          messages: this.messages,
          files: this.files,
        })
        const assistantMessage: ChatMessage = {
          id: createId('message'),
          conversationId: this.selectedConversationId,
          role: 'assistant',
          content: response,
          createdAt: now(),
        }

        await putRecord('messages', assistantMessage)
        this.messages = [...this.messages, assistantMessage]
      } finally {
        const conversation = this.selectedConversation

        if (conversation) {
          const updated: Conversation = {
            ...conversation,
            updatedAt: now(),
          }

          await putRecord('conversations', updated)
          this.conversations = sortUpdated([
            ...this.conversations.filter((item) => item.id !== updated.id),
            updated,
          ])
        }

        this.sending = false
      }
    },
  },
})
