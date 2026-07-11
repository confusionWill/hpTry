import { defineStore } from 'pinia'

import {
  generateConversationTitle,
  runAgentConversation,
  type AgentRunContext,
} from '@/services/agent/runner'
import { ChatCompletionRequestError } from '@/services/openai'
import {
  deleteRecord,
  deleteRecordsByIndex,
  getAllRecords,
  getRecord,
  getRecordsByIndex,
  putRecord,
} from '@/services/db'
import {
  deleteProjectWorkspaceFile,
  loadProjectWorkspaceFiles,
  renameProjectWorkspaceFile,
  upsertProjectWorkspaceAsset,
  upsertProjectWorkspaceFile,
} from '@/services/agent/workspaceFiles'
import { exportWorkspaceAsZip } from '@/services/agent/workspaceExport'
import type {
  ChatMessage,
  Conversation,
  ConversationEvent,
  Project,
  ProjectPayload,
  Provider,
  ProviderPayload,
  ToolCall,
  ToolRun,
  WorkspaceFile,
} from '@/types/agent'
import { createId, now, sortCreated, sortUpdated } from '@/utils/records'

const SELECTED_PROJECT_STORAGE_KEY = 'hpTry:selected-project-id'
const SELECTED_PROVIDER_STORAGE_KEY = 'hpTry:selected-provider-id'
const activeRunControllers = new Map<string, AbortController>()

interface ActiveAgentRun {
  projectId: string
  conversationId: string
}

export type WorkspaceUploadPayload =
  | {
      path: string
      content: string
    }
  | {
      path: string
      blob: Blob
      name: string
      mimeType: string
    }

function loadSelectedProviderId(): string {
  return localStorage.getItem(SELECTED_PROVIDER_STORAGE_KEY) ?? ''
}

function loadSelectedProjectId(): string {
  return localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY) ?? ''
}

function saveSelectedProjectId(projectId: string): void {
  if (projectId) {
    localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, projectId)
    return
  }

  localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY)
}

function saveSelectedProviderId(providerId: string): void {
  if (providerId) {
    localStorage.setItem(SELECTED_PROVIDER_STORAGE_KEY, providerId)
    return
  }

  localStorage.removeItem(SELECTED_PROVIDER_STORAGE_KEY)
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new ChatCompletionRequestError('aborted', 'Request was canceled')
  }
}

export const useAgentStore = defineStore('agent', {
  state: () => ({
    projects: [] as Project[],
    conversations: [] as Conversation[],
    events: [] as ConversationEvent[],
    providers: [] as Provider[],
    workspaceFiles: [] as WorkspaceFile[],
    selectedProjectId: '',
    selectedConversationId: '',
    selectedProviderId: '',
    selectedWorkspaceFilePath: '',
    draftConversationProjectId: '',
    loading: false,
    exportingZip: false,
    activeRuns: [] as ActiveAgentRun[],
    stoppingConversationIds: [] as string[],
    projectLoadToken: 0,
    conversationLoadToken: 0,
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
    selectedWorkspaceFile(state): WorkspaceFile | undefined {
      return state.workspaceFiles.find((file) => file.path === state.selectedWorkspaceFilePath)
    },
    isDraftConversationActive(state): boolean {
      return (
        Boolean(state.selectedProjectId) &&
        state.draftConversationProjectId === state.selectedProjectId &&
        !state.selectedConversationId
      )
    },
    isProjectRunning(state): (projectId: string) => boolean {
      return (projectId: string) => state.activeRuns.some((run) => run.projectId === projectId)
    },
    isConversationRunning(state): (conversationId: string) => boolean {
      return (conversationId: string) =>
        state.activeRuns.some((run) => run.conversationId === conversationId)
    },
    isSelectedProjectRunning(state): boolean {
      return (
        Boolean(state.selectedProjectId) &&
        state.activeRuns.some((run) => run.projectId === state.selectedProjectId)
      )
    },
    isSelectedProjectStopping(state): boolean {
      return (
        Boolean(state.selectedProjectId) &&
        state.activeRuns.some(
          (run) =>
            run.projectId === state.selectedProjectId &&
            state.stoppingConversationIds.includes(run.conversationId),
        )
      )
    },
    isSelectedConversationRunning(state): boolean {
      return (
        Boolean(state.selectedConversationId) &&
        state.activeRuns.some((run) => run.conversationId === state.selectedConversationId)
      )
    },
  },
  actions: {
    async load() {
      this.loading = true
      try {
        this.projects = sortUpdated(await getAllRecords('projects'))
        this.providers = sortUpdated(await getAllRecords('providers'))

        if (!this.selectedProjectId && this.projects[0]) {
          const savedProjectId = loadSelectedProjectId()
          const project = this.projects.find((item) => item.id === savedProjectId)
          this.selectedProjectId = project?.id ?? this.projects[0].id
        }

        if (!this.selectedProviderId) {
          const savedProviderId = loadSelectedProviderId()
          const provider = this.providers.find((item) => item.id === savedProviderId)
          this.selectProvider(provider?.id ?? this.providers[0]?.id ?? '')
        }

        if (this.selectedProjectId) {
          await this.selectProject(this.selectedProjectId)
        }
      } finally {
        this.loading = false
      }
    },
    async selectProject(projectId: string, startNewConversation = false) {
      const loadToken = this.projectLoadToken + 1

      this.projectLoadToken = loadToken
      this.selectedProjectId = projectId
      saveSelectedProjectId(projectId)
      const conversations = sortUpdated(
        await getRecordsByIndex('conversations', 'projectId', projectId),
      )

      if (this.projectLoadToken !== loadToken) {
        return
      }

      this.conversations = conversations
      this.selectedConversationId = startNewConversation ? '' : (this.conversations[0]?.id ?? '')
      this.draftConversationProjectId = startNewConversation ? projectId : ''
      this.events = []
      this.conversationLoadToken += 1
      await this.loadWorkspaceFiles(projectId, loadToken)

      if (this.projectLoadToken !== loadToken) {
        return
      }

      if (this.selectedConversationId) {
        await this.selectConversation(this.selectedConversationId)
      } else {
        this.events = []
      }
    },
    async loadWorkspaceFiles(projectId: string, loadToken?: number) {
      const expectedLoadToken = loadToken ?? this.projectLoadToken
      const workspaceFiles = await loadProjectWorkspaceFiles(projectId)

      if (this.projectLoadToken !== expectedLoadToken) {
        return
      }

      this.workspaceFiles = workspaceFiles

      if (
        this.selectedWorkspaceFilePath &&
        !this.workspaceFiles.some((file) => file.path === this.selectedWorkspaceFilePath)
      ) {
        this.selectedWorkspaceFilePath = ''
      }

      if (!this.selectedWorkspaceFilePath) {
        this.selectedWorkspaceFilePath = this.workspaceFiles[0]?.path ?? ''
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
      await this.selectProject(project.id, true)
    },
    async deleteProject(projectId: string) {
      if (this.isProjectRunning(projectId)) {
        throw new Error('Cannot delete a project while its agent is running')
      }

      const conversations = await getRecordsByIndex('conversations', 'projectId', projectId)

      await Promise.all(
        conversations.map(async (conversation) => {
          await deleteRecordsByIndex('conversationEvents', 'conversationId', conversation.id)
        }),
      )
      await deleteRecordsByIndex('workspaceFiles', 'projectId', projectId)
      await deleteRecordsByIndex('workspaceAssets', 'projectId', projectId)
      await deleteRecordsByIndex('conversations', 'projectId', projectId)
      await deleteRecord('projects', projectId)

      this.projects = this.projects.filter((project) => project.id !== projectId)
      this.selectedProjectId = this.projects[0]?.id ?? ''
      saveSelectedProjectId(this.selectedProjectId)

      if (this.selectedProjectId) {
        await this.selectProject(this.selectedProjectId)
      } else {
        this.conversations = []
        this.events = []
        this.workspaceFiles = []
        this.selectedConversationId = ''
        this.selectedWorkspaceFilePath = ''
        this.draftConversationProjectId = ''
      }
    },
    stopProjectRun(projectId: string) {
      const run = this.activeRuns.find((item) => item.projectId === projectId)

      if (!run) {
        return
      }

      if (this.stoppingConversationIds.includes(run.conversationId)) {
        return
      }

      this.stoppingConversationIds = [...this.stoppingConversationIds, run.conversationId]
      activeRunControllers.get(run.conversationId)?.abort()
    },
    stopSelectedProjectRun() {
      if (!this.selectedProjectId) {
        return
      }

      this.stopProjectRun(this.selectedProjectId)
    },
    startDraftConversation() {
      if (!this.selectedProjectId) {
        return
      }

      this.draftConversationProjectId = this.selectedProjectId
      this.selectedConversationId = ''
      this.events = []
      this.conversationLoadToken += 1
    },
    async selectConversation(conversationId: string) {
      const loadToken = this.conversationLoadToken + 1
      const projectId = this.selectedProjectId
      const conversation = this.conversations.find((item) => item.id === conversationId)

      if (!conversation) {
        throw new Error('Conversation not found in the selected project')
      }

      if (conversation.projectId !== this.selectedProjectId) {
        throw new Error('Conversation project does not match the selected project')
      }

      this.selectedConversationId = conversationId
      this.draftConversationProjectId = ''
      this.events = []
      this.conversationLoadToken = loadToken

      const events = await getRecordsByIndex('conversationEvents', 'conversationId', conversationId)

      if (
        this.conversationLoadToken !== loadToken ||
        this.selectedProjectId !== projectId ||
        this.selectedConversationId !== conversationId
      ) {
        return
      }

      this.events = sortCreated(events)
    },
    selectProvider(providerId: string) {
      this.selectedProviderId = providerId
      saveSelectedProviderId(providerId)
    },
    selectWorkspaceFile(path: string) {
      this.selectedWorkspaceFilePath = path
    },
    async deleteConversation(conversationId: string) {
      if (this.isConversationRunning(conversationId)) {
        throw new Error('Cannot delete a conversation while its agent is running')
      }

      await deleteRecordsByIndex('conversationEvents', 'conversationId', conversationId)
      await deleteRecord('conversations', conversationId)
      this.conversations = this.conversations.filter(
        (conversation) => conversation.id !== conversationId,
      )
      this.selectedConversationId = this.conversations[0]?.id ?? ''
      this.events = []
      this.conversationLoadToken += 1

      if (this.selectedConversationId) {
        await this.selectConversation(this.selectedConversationId)
      }
    },
    async updateConversationTitle(conversationId: string, title: string) {
      const trimmedTitle = title.trim()
      const conversation =
        this.conversations.find((item) => item.id === conversationId) ??
        (await getRecord('conversations', conversationId))

      if (!conversation || !trimmedTitle) {
        return
      }

      if (conversation.title === trimmedTitle) {
        return
      }

      const updated: Conversation = {
        ...conversation,
        title: trimmedTitle,
        updatedAt: now(),
      }

      await putRecord('conversations', updated)

      if (updated.projectId === this.selectedProjectId) {
        this.conversations = sortUpdated([
          ...this.conversations.filter((item) => item.id !== updated.id),
          updated,
        ])
      }
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
      this.selectProvider(provider.id)
    },
    async deleteProvider(providerId: string) {
      await deleteRecord('providers', providerId)
      this.providers = this.providers.filter((provider) => provider.id !== providerId)
      this.selectProvider(this.providers[0]?.id ?? '')
    },
    async upsertWorkspaceFile(
      projectId: string,
      files: WorkspaceFile[],
      path: string,
      content: string,
    ): Promise<WorkspaceFile> {
      const file = await upsertProjectWorkspaceFile(projectId, files, path, content)

      if (this.selectedProjectId === projectId) {
        this.workspaceFiles = [...files]
        this.selectedWorkspaceFilePath = file.path
      }

      return file
    },
    async uploadFilesToSelectedWorkspace(payloads: WorkspaceUploadPayload[]): Promise<WorkspaceFile[]> {
      const projectId = this.selectedProjectId

      if (!projectId || payloads.length === 0) {
        return []
      }

      const files = [...this.workspaceFiles]
      const uploadedFiles: WorkspaceFile[] = []

      for (const payload of payloads) {
        const file =
          'content' in payload
            ? await upsertProjectWorkspaceFile(projectId, files, payload.path, payload.content)
            : await upsertProjectWorkspaceAsset(
                projectId,
                files,
                payload.path,
                payload.blob,
                payload.name,
                payload.mimeType,
              )
        uploadedFiles.push(file)
      }

      if (this.selectedProjectId === projectId) {
        this.workspaceFiles = [...files]
        this.selectedWorkspaceFilePath = uploadedFiles.at(-1)?.path ?? this.selectedWorkspaceFilePath
      }

      return uploadedFiles
    },
    async deleteWorkspaceFile(projectId: string, files: WorkspaceFile[], path: string) {
      const nextFiles = await deleteProjectWorkspaceFile(projectId, files, path)

      if (this.selectedProjectId === projectId) {
        this.workspaceFiles = nextFiles

        if (
          this.selectedWorkspaceFilePath &&
          !this.workspaceFiles.some((file) => file.path === this.selectedWorkspaceFilePath)
        ) {
          this.selectedWorkspaceFilePath = this.workspaceFiles[0]?.path ?? ''
        }
      }
    },
    async renameWorkspaceFile(
      projectId: string,
      files: WorkspaceFile[],
      fromPath: string,
      toPath: string,
    ): Promise<WorkspaceFile> {
      const file = await renameProjectWorkspaceFile(projectId, files, fromPath, toPath)

      if (this.selectedProjectId === projectId) {
        this.workspaceFiles = [...files]
        this.selectedWorkspaceFilePath = file.path
      }

      return file
    },
    async createToolRun(
      conversationId: string,
      events: ConversationEvent[],
      toolCall: ToolCall,
    ): Promise<ToolRun> {
      const timestamp = now()
      const run: ToolRun = {
        id: createId('tool'),
        conversationId,
        type: 'tool',
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        status: 'running',
        input: toolCall.function.arguments,
        output: '',
        error: '',
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      await putRecord('conversationEvents', run)
      const nextEvents = sortCreated([...events, run])
      events.splice(0, events.length, ...nextEvents)

      if (this.selectedConversationId === conversationId) {
        this.events = nextEvents
      }

      return run
    },
    async updateToolRun(
      events: ConversationEvent[],
      run: ToolRun,
      patch: Pick<ToolRun, 'status' | 'output' | 'error'>,
    ) {
      const updated: ToolRun = {
        ...run,
        ...patch,
        updatedAt: now(),
      }

      await putRecord('conversationEvents', updated)
      const nextEvents = sortCreated([...events.filter((item) => item.id !== updated.id), updated])
      events.splice(0, events.length, ...nextEvents)

      if (this.selectedConversationId === updated.conversationId) {
        this.events = nextEvents
      }
    },
    async sendMessage(
      content: string,
      systemPrompt: string,
      emptyFinalMessage: string,
      titlePrompt: string,
      draftTitle: string,
    ) {
      const runProject = this.selectedProject
      let runConversation = this.selectedConversation
      const runProvider = this.selectedProvider

      if (!runProject || !runProvider) {
        return
      }

      if (this.isProjectRunning(runProject.id)) {
        throw new Error('This project agent is already running')
      }

      const isNewConversation = !runConversation

      if (!runConversation) {
        const timestamp = now()
        runConversation = {
          id: createId('conversation'),
          projectId: runProject.id,
          title: draftTitle.trim(),
          createdAt: timestamp,
          updatedAt: timestamp,
        }

        await putRecord('conversations', runConversation)

        if (this.selectedProjectId === runProject.id) {
          this.conversations = sortUpdated([...this.conversations, runConversation])
          this.selectedConversationId = runConversation.id
          this.draftConversationProjectId = ''
        }
      }

      if (runConversation.projectId !== runProject.id) {
        throw new Error('Conversation project does not match the selected project')
      }

      this.activeRuns = [
        ...this.activeRuns,
        {
          projectId: runProject.id,
          conversationId: runConversation.id,
        },
      ]
      const abortController = new AbortController()
      activeRunControllers.set(runConversation.id, abortController)

      try {
        const runContext: AgentRunContext = {
          project: runProject,
          conversation: runConversation,
          provider: runProvider,
          files: await loadProjectWorkspaceFiles(runProject.id),
          events: sortCreated(
            await getRecordsByIndex('conversationEvents', 'conversationId', runConversation.id),
          ),
        }
        const timestamp = now()
        const userMessage: ChatMessage = {
          id: createId('message'),
          conversationId: runConversation.id,
          type: 'message',
          role: 'user',
          content,
          createdAt: timestamp,
          updatedAt: timestamp,
        }

        await putRecord('conversationEvents', userMessage)
        runContext.events = sortCreated([...runContext.events, userMessage])

        if (this.selectedConversationId === runConversation.id) {
          this.events = [...this.events, userMessage]
        }

        if (isNewConversation) {
          try {
            const title = await generateConversationTitle({
              provider: runProvider,
              titlePrompt,
              userMessage: content,
              signal: abortController.signal,
            })
            throwIfAborted(abortController.signal)
            await this.updateConversationTitle(runConversation.id, title)
          } catch (error) {
            if (abortController.signal.aborted) {
              throw error
            }
            // Keep the draft title if title generation fails.
          }
        }

        const finalContent = await runAgentConversation({
          systemPrompt,
          events: runContext.events,
          runContext,
          signal: abortController.signal,
          handlers: {
            createToolRun: (toolCall) =>
              this.createToolRun(runConversation.id, runContext.events, toolCall),
            updateToolRun: (run, patch) => this.updateToolRun(runContext.events, run, patch),
            writeFile: (path, fileContent) =>
              this.upsertWorkspaceFile(runProject.id, runContext.files, path, fileContent),
            deleteFile: (path) => this.deleteWorkspaceFile(runProject.id, runContext.files, path),
            renameFile: (fromPath, toPath) =>
              this.renameWorkspaceFile(runProject.id, runContext.files, fromPath, toPath),
          },
        })

        throwIfAborted(abortController.signal)
        const responseEndedAt = now()
        const assistantMessage: ChatMessage = {
          id: createId('message'),
          conversationId: runConversation.id,
          type: 'message',
          role: 'assistant',
          content: finalContent || emptyFinalMessage,
          createdAt: responseEndedAt,
          updatedAt: responseEndedAt,
          responseDurationMs: responseEndedAt - userMessage.createdAt,
        }

        await putRecord('conversationEvents', assistantMessage)

        if (this.selectedConversationId === runConversation.id) {
          this.events = [...this.events, assistantMessage]
        }

      } finally {
        const conversation =
          this.conversations.find((item) => item.id === runConversation.id) ??
          (await getRecord('conversations', runConversation.id))

        if (conversation || runConversation) {
          const updated: Conversation = {
            ...(conversation ?? runConversation),
            updatedAt: now(),
          }

          await putRecord('conversations', updated)

          if (updated.projectId === this.selectedProjectId) {
            this.conversations = sortUpdated([
              ...this.conversations.filter((item) => item.id !== updated.id),
              updated,
            ])
          }
        }

        this.activeRuns = this.activeRuns.filter(
          (run) => run.conversationId !== runConversation.id,
        )
        this.stoppingConversationIds = this.stoppingConversationIds.filter(
          (conversationId) => conversationId !== runConversation.id,
        )
        activeRunControllers.delete(runConversation.id)
      }
    },
    async exportCurrentWorkspaceZip() {
      if (!this.selectedProject || this.workspaceFiles.length === 0) {
        return
      }

      this.exportingZip = true
      try {
        await exportWorkspaceAsZip(this.selectedProject, this.workspaceFiles)
      } finally {
        this.exportingZip = false
      }
    },
  },
})
