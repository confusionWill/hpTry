import { defineStore } from 'pinia'

import {
  generateConversationTitle,
  runAgentConversation,
  type AgentRunContext,
} from '@/services/agent/runner'
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
  upsertProjectWorkspaceFile,
} from '@/services/agent/workspaceFiles'
import { exportWorkspaceAsZip } from '@/services/agent/workspaceExport'
import type {
  ChatMessage,
  Conversation,
  Project,
  ProjectPayload,
  Provider,
  ProviderPayload,
  ToolCall,
  ToolRun,
  WorkspaceFile,
} from '@/types/agent'
import { createId, now, sortCreated, sortUpdated } from '@/utils/records'

const SELECTED_PROVIDER_STORAGE_KEY = 'hpWill:selected-provider-id'

interface ActiveAgentRun {
  projectId: string
  conversationId: string
}

const WORKSPACE_TOOL_INTENT_PATTERNS = [
  /创建|生成|实现|开发|搭建|写(一个|个|下|出|入|代码|文件)?|做(一个|个)?|修改|更改|改成|修复|删除|重命名|查看|读取|检查|分析|审查|优化|重构|预览|导出/,
  /\b(create|generate|build|implement|make|write|modify|change|fix|delete|rename|read|view|inspect|check|analyze|review|optimize|refactor|preview|export)\b/i,
]

function loadSelectedProviderId(): string {
  return localStorage.getItem(SELECTED_PROVIDER_STORAGE_KEY) ?? ''
}

function saveSelectedProviderId(providerId: string): void {
  if (providerId) {
    localStorage.setItem(SELECTED_PROVIDER_STORAGE_KEY, providerId)
    return
  }

  localStorage.removeItem(SELECTED_PROVIDER_STORAGE_KEY)
}

function shouldAllowWorkspaceTools(message: string): boolean {
  return WORKSPACE_TOOL_INTENT_PATTERNS.some((pattern) => pattern.test(message))
}

export const useAgentStore = defineStore('agent', {
  state: () => ({
    projects: [] as Project[],
    conversations: [] as Conversation[],
    messages: [] as ChatMessage[],
    providers: [] as Provider[],
    workspaceFiles: [] as WorkspaceFile[],
    toolRuns: [] as ToolRun[],
    selectedProjectId: '',
    selectedConversationId: '',
    selectedProviderId: '',
    selectedWorkspaceFilePath: '',
    draftConversationProjectId: '',
    loading: false,
    exportingZip: false,
    activeRuns: [] as ActiveAgentRun[],
    projectLoadToken: 0,
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
          this.selectedProjectId = this.projects[0].id
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
    async selectProject(projectId: string) {
      const loadToken = this.projectLoadToken + 1

      this.projectLoadToken = loadToken
      this.selectedProjectId = projectId
      const conversations = sortUpdated(
        await getRecordsByIndex('conversations', 'projectId', projectId),
      )

      if (this.projectLoadToken !== loadToken) {
        return
      }

      this.conversations = conversations
      this.selectedConversationId = this.conversations[0]?.id ?? ''
      this.draftConversationProjectId = ''
      this.messages = []
      await this.loadWorkspaceFiles(projectId, loadToken)

      if (this.projectLoadToken !== loadToken) {
        return
      }

      if (this.selectedConversationId) {
        await this.selectConversation(this.selectedConversationId)
      } else {
        this.toolRuns = []
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
    async loadToolRuns(conversationId: string) {
      this.toolRuns = sortCreated(
        await getRecordsByIndex('toolRuns', 'conversationId', conversationId),
      )
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
      if (this.isProjectRunning(projectId)) {
        throw new Error('Cannot delete a project while its agent is running')
      }

      const conversations = await getRecordsByIndex('conversations', 'projectId', projectId)

      await Promise.all(
        conversations.map(async (conversation) => {
          await deleteRecordsByIndex('messages', 'conversationId', conversation.id)
          await deleteRecordsByIndex('toolRuns', 'conversationId', conversation.id)
        }),
      )
      await deleteRecordsByIndex('workspaceFiles', 'projectId', projectId)
      await deleteRecordsByIndex('conversations', 'projectId', projectId)
      await deleteRecord('projects', projectId)

      this.projects = this.projects.filter((project) => project.id !== projectId)
      this.selectedProjectId = this.projects[0]?.id ?? ''

      if (this.selectedProjectId) {
        await this.selectProject(this.selectedProjectId)
      } else {
        this.conversations = []
        this.messages = []
        this.workspaceFiles = []
        this.toolRuns = []
        this.selectedConversationId = ''
        this.selectedWorkspaceFilePath = ''
        this.draftConversationProjectId = ''
      }
    },
    startDraftConversation() {
      if (!this.selectedProjectId) {
        return
      }

      this.draftConversationProjectId = this.selectedProjectId
      this.selectedConversationId = ''
      this.messages = []
      this.toolRuns = []
    },
    async selectConversation(conversationId: string) {
      const conversation = this.conversations.find((item) => item.id === conversationId)

      if (!conversation) {
        throw new Error('Conversation not found in the selected project')
      }

      if (conversation.projectId !== this.selectedProjectId) {
        throw new Error('Conversation project does not match the selected project')
      }

      this.selectedConversationId = conversationId
      this.draftConversationProjectId = ''
      this.messages = sortCreated(
        await getRecordsByIndex('messages', 'conversationId', conversationId),
      )
      await this.loadToolRuns(conversationId)
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

      await deleteRecordsByIndex('messages', 'conversationId', conversationId)
      await deleteRecordsByIndex('toolRuns', 'conversationId', conversationId)
      await deleteRecord('conversations', conversationId)
      this.conversations = this.conversations.filter(
        (conversation) => conversation.id !== conversationId,
      )
      this.selectedConversationId = this.conversations[0]?.id ?? ''
      this.messages = []
      this.toolRuns = []

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
    async createToolRun(conversationId: string, toolRuns: ToolRun[], toolCall: ToolCall): Promise<ToolRun> {
      const timestamp = now()
      const run: ToolRun = {
        id: createId('tool'),
        conversationId,
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        status: 'running',
        input: toolCall.function.arguments,
        output: '',
        error: '',
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      await putRecord('toolRuns', run)
      const nextToolRuns = sortCreated([...toolRuns, run])
      toolRuns.splice(0, toolRuns.length, ...nextToolRuns)

      if (this.selectedConversationId === conversationId) {
        this.toolRuns = nextToolRuns
      }

      return run
    },
    async updateToolRun(
      toolRuns: ToolRun[],
      run: ToolRun,
      patch: Pick<ToolRun, 'status' | 'output' | 'error'>,
    ) {
      const updated: ToolRun = {
        ...run,
        ...patch,
        updatedAt: now(),
      }

      await putRecord('toolRuns', updated)
      const nextToolRuns = sortCreated([...toolRuns.filter((item) => item.id !== updated.id), updated])
      toolRuns.splice(0, toolRuns.length, ...nextToolRuns)

      if (this.selectedConversationId === updated.conversationId) {
        this.toolRuns = nextToolRuns
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

      try {
        const runContext: AgentRunContext = {
          project: runProject,
          conversation: runConversation,
          provider: runProvider,
          files: await loadProjectWorkspaceFiles(runProject.id),
          toolRuns: sortCreated(
            await getRecordsByIndex('toolRuns', 'conversationId', runConversation.id),
          ),
        }
        const timestamp = now()
        const userMessage: ChatMessage = {
          id: createId('message'),
          conversationId: runConversation.id,
          role: 'user',
          content,
          createdAt: timestamp,
        }

        await putRecord('messages', userMessage)

        if (this.selectedConversationId === runConversation.id) {
          this.messages = [...this.messages, userMessage]
        }

        if (isNewConversation) {
          try {
            const title = await generateConversationTitle({
              provider: runProvider,
              titlePrompt,
              userMessage: content,
            })
            await this.updateConversationTitle(runConversation.id, title)
          } catch {
            // Keep the draft title if title generation fails.
          }
        }

        const runMessages = sortCreated(
          await getRecordsByIndex('messages', 'conversationId', runConversation.id),
        )
        const finalContent = await runAgentConversation({
          systemPrompt,
          messages: runMessages,
          runContext,
          allowTools: shouldAllowWorkspaceTools(content),
          handlers: {
            createToolRun: (toolCall) =>
              this.createToolRun(runConversation.id, runContext.toolRuns, toolCall),
            updateToolRun: (run, patch) => this.updateToolRun(runContext.toolRuns, run, patch),
            writeFile: (path, fileContent) =>
              this.upsertWorkspaceFile(runProject.id, runContext.files, path, fileContent),
            deleteFile: (path) => this.deleteWorkspaceFile(runProject.id, runContext.files, path),
            renameFile: (fromPath, toPath) =>
              this.renameWorkspaceFile(runProject.id, runContext.files, fromPath, toPath),
          },
        })

        const responseEndedAt = now()
        const assistantMessage: ChatMessage = {
          id: createId('message'),
          conversationId: runConversation.id,
          role: 'assistant',
          content: finalContent || emptyFinalMessage,
          createdAt: responseEndedAt,
          responseDurationMs: responseEndedAt - userMessage.createdAt,
        }

        await putRecord('messages', assistantMessage)

        if (this.selectedConversationId === runConversation.id) {
          this.messages = [...this.messages, assistantMessage]
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
