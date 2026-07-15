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
  getRecordsByIndexCursor,
  putRecord,
} from '@/services/db'
import {
  clearTemporaryWorkspaceFiles,
  deleteProjectWorkspaceFile,
  deleteProjectWorkspaceDirectory,
  loadProjectWorkspaceFiles,
  renameProjectWorkspaceFile,
  renameProjectWorkspaceDirectory,
  upsertProjectWorkspaceAsset,
  upsertProjectWorkspaceFile,
} from '@/services/agent/workspaceFiles'
import { initializePresentationWorkspace } from '@/services/agent/presentationTemplate'
import { exportWorkspaceAsZip } from '@/services/agent/workspaceExport'
import type {
  ChatMessage,
  Conversation,
  ConversationEvent,
  ConversationTurn,
  Project,
  ProjectPayload,
  Provider,
  ProviderPayload,
  ToolCall,
  ToolRun,
  WorkspaceFile,
} from '@/types/agent'
import { createId, now, sortUpdated } from '@/utils/records'

const SELECTED_PROJECT_STORAGE_KEY = 'hpTry:selected-project-id'
const SELECTED_PROVIDER_STORAGE_KEY = 'hpTry:selected-provider-id'
const CONVERSATION_TURN_PAGE_SIZE = 10
const activeRunControllers = new Map<string, AbortController>()

interface ActiveAgentRun {
  projectId: string
  conversationId: string
}

interface ConversationTurnPage {
  turns: ConversationTurn[]
  events: ConversationEvent[]
  hasOlder: boolean
}

function sortTurns(turns: ConversationTurn[]): ConversationTurn[] {
  return [...turns].sort((left, right) => left.sequence - right.sequence)
}

function sortTurnEvents(events: ConversationEvent[]): ConversationEvent[] {
  return [...events].sort((left, right) => left.sequence - right.sequence)
}

async function loadEventsForTurns(turns: ConversationTurn[]): Promise<ConversationEvent[]> {
  const eventGroups = await Promise.all(
    turns.map((turn) => getRecordsByIndex('conversationEvents', 'turnId', turn.id)),
  )

  return eventGroups.flatMap(sortTurnEvents)
}

async function loadConversationTurnPage(
  conversationId: string,
  beforeSequence?: number,
): Promise<ConversationTurnPage> {
  const lowerBound: [string, number] = [conversationId, 0]
  const upperBound: [string, number] = [
    conversationId,
    beforeSequence ?? Number.MAX_SAFE_INTEGER,
  ]
  const range = IDBKeyRange.bound(
    lowerBound,
    upperBound,
    false,
    beforeSequence !== undefined,
  )
  const records = await getRecordsByIndexCursor(
    'conversationTurns',
    'conversationSequence',
    range,
    'prev',
    CONVERSATION_TURN_PAGE_SIZE + 1,
  )
  const hasOlder = records.length > CONVERSATION_TURN_PAGE_SIZE
  const turns = sortTurns(records.slice(0, CONVERSATION_TURN_PAGE_SIZE))

  return {
    turns,
    events: await loadEventsForTurns(turns),
    hasOlder,
  }
}

async function loadConversationHistory(conversationId: string): Promise<{
  turns: ConversationTurn[]
  events: ConversationEvent[]
}> {
  const turns = sortTurns(
    await getRecordsByIndex('conversationTurns', 'conversationId', conversationId),
  )
  const turnSequences = new Map(turns.map((turn) => [turn.id, turn.sequence]))
  const events = await getRecordsByIndex('conversationEvents', 'conversationId', conversationId)

  events.sort((left, right) => {
    const turnDifference =
      (turnSequences.get(left.turnId) ?? Number.MAX_SAFE_INTEGER) -
      (turnSequences.get(right.turnId) ?? Number.MAX_SAFE_INTEGER)

    return turnDifference || left.sequence - right.sequence
  })

  return { turns, events }
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
    turns: [] as ConversationTurn[],
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
    loadingOlderTurns: false,
    hasOlderTurns: false,
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
        await clearTemporaryWorkspaceFiles()
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
      this.turns = []
      this.events = []
      this.hasOlderTurns = false
      this.loadingOlderTurns = false
      this.conversationLoadToken += 1
      await this.loadWorkspaceFiles(projectId, loadToken)

      if (this.projectLoadToken !== loadToken) {
        return
      }

      if (this.selectedConversationId) {
        await this.selectConversation(this.selectedConversationId)
      } else {
        this.turns = []
        this.events = []
        this.hasOlderTurns = false
        this.loadingOlderTurns = false
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

      try {
        await initializePresentationWorkspace(project.id, project.name)
      } catch (error) {
        await deleteRecordsByIndex('workspaceFiles', 'projectId', project.id)
        await deleteRecordsByIndex('workspaceAssets', 'projectId', project.id)
        await deleteRecord('projects', project.id)
        throw error
      }

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
          await deleteRecordsByIndex('conversationTurns', 'conversationId', conversation.id)
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
        this.turns = []
        this.events = []
        this.workspaceFiles = []
        this.selectedConversationId = ''
        this.selectedWorkspaceFilePath = ''
        this.draftConversationProjectId = ''
        this.hasOlderTurns = false
        this.loadingOlderTurns = false
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
      this.turns = []
      this.events = []
      this.hasOlderTurns = false
      this.loadingOlderTurns = false
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
      this.turns = []
      this.events = []
      this.hasOlderTurns = false
      this.loadingOlderTurns = false
      this.conversationLoadToken = loadToken

      const page = await loadConversationTurnPage(conversationId)

      if (
        this.conversationLoadToken !== loadToken ||
        this.selectedProjectId !== projectId ||
        this.selectedConversationId !== conversationId
      ) {
        return
      }

      this.turns = page.turns
      this.events = page.events
      this.hasOlderTurns = page.hasOlder
    },
    async loadOlderConversationTurns() {
      const conversationId = this.selectedConversationId
      const oldestTurn = this.turns[0]

      if (!conversationId || !oldestTurn || !this.hasOlderTurns || this.loadingOlderTurns) {
        return
      }

      const loadToken = this.conversationLoadToken
      this.loadingOlderTurns = true

      try {
        const page = await loadConversationTurnPage(conversationId, oldestTurn.sequence)

        if (
          this.conversationLoadToken !== loadToken ||
          this.selectedConversationId !== conversationId
        ) {
          return
        }

        this.turns = [...page.turns, ...this.turns]
        this.events = [...page.events, ...this.events]
        this.hasOlderTurns = page.hasOlder
      } finally {
        if (
          this.conversationLoadToken === loadToken &&
          this.selectedConversationId === conversationId
        ) {
          this.loadingOlderTurns = false
        }
      }
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
      await deleteRecordsByIndex('conversationTurns', 'conversationId', conversationId)
      await deleteRecord('conversations', conversationId)
      this.conversations = this.conversations.filter(
        (conversation) => conversation.id !== conversationId,
      )
      this.selectedConversationId = this.conversations[0]?.id ?? ''
      this.turns = []
      this.events = []
      this.hasOlderTurns = false
      this.loadingOlderTurns = false
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
    async uploadFilesToWorkspace(
      projectId: string,
      payloads: WorkspaceUploadPayload[],
    ): Promise<WorkspaceFile[]> {
      if (!projectId || payloads.length === 0) {
        return []
      }

      const files =
        this.selectedProjectId === projectId
          ? [...this.workspaceFiles]
          : await loadProjectWorkspaceFiles(projectId)
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
    async deleteWorkspaceDirectory(projectId: string, files: WorkspaceFile[], path: string) {
      const beforeCount = files.length
      const nextFiles = await deleteProjectWorkspaceDirectory(projectId, files, path)
      if (this.selectedProjectId === projectId) {
        this.workspaceFiles = nextFiles
        if (!nextFiles.some((file) => file.path === this.selectedWorkspaceFilePath)) {
          this.selectedWorkspaceFilePath = nextFiles[0]?.path ?? ''
        }
      }
      return beforeCount - nextFiles.length
    },
    async renameWorkspaceDirectory(
      projectId: string,
      files: WorkspaceFile[],
      fromPath: string,
      toPath: string,
    ) {
      const selectedPath = this.selectedWorkspaceFilePath
      const movedFiles = await renameProjectWorkspaceDirectory(projectId, files, fromPath, toPath)
      if (this.selectedProjectId === projectId) {
        this.workspaceFiles = [...files]
        if (selectedPath.startsWith(`${fromPath}/`)) {
          this.selectedWorkspaceFilePath = `${toPath}${selectedPath.slice(fromPath.length)}`
        }
      }
      return movedFiles
    },
    async createToolRun(
      conversationId: string,
      turnId: string,
      sequence: number,
      stepSequence: number,
      events: ConversationEvent[],
      toolCall: ToolCall,
    ): Promise<ToolRun> {
      const timestamp = now()
      const run: ToolRun = {
        id: createId('tool'),
        conversationId,
        turnId,
        sequence,
        stepSequence,
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
      events.push(run)

      if (this.selectedConversationId === conversationId) {
        this.events.push(run)
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
      const runContextEventIndex = events.findIndex((item) => item.id === updated.id)

      if (runContextEventIndex >= 0) {
        events.splice(runContextEventIndex, 1, updated)
      }

      if (this.selectedConversationId === updated.conversationId) {
        const visibleEventIndex = this.events.findIndex((item) => item.id === updated.id)

        if (visibleEventIndex >= 0) {
          this.events.splice(visibleEventIndex, 1, updated)
        }
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
      let streamingAssistantMessage: ChatMessage | undefined
      let streamRenderTimer: ReturnType<typeof setTimeout> | undefined
      let conversationTurn: ConversationTurn | undefined
      let eventSequence = 0

      const cancelStreamRender = () => {
        if (streamRenderTimer !== undefined) {
          clearTimeout(streamRenderTimer)
          streamRenderTimer = undefined
        }
      }

      const upsertVisibleMessage = (message: ChatMessage) => {
        if (this.selectedConversationId !== runConversation.id) {
          return
        }

        const eventIndex = this.events.findIndex((event) => event.id === message.id)

        if (eventIndex >= 0) {
          this.events.splice(eventIndex, 1, message)
        } else {
          this.events.push(message)
        }
      }

      const removeVisibleMessage = (messageId: string) => {
        if (this.selectedConversationId !== runConversation.id) {
          return
        }

        const eventIndex = this.events.findIndex((event) => event.id === messageId)

        if (eventIndex >= 0) {
          this.events.splice(eventIndex, 1)
        }
      }

      const scheduleStreamRender = () => {
        if (streamRenderTimer !== undefined) {
          return
        }

        streamRenderTimer = setTimeout(() => {
          streamRenderTimer = undefined

          if (streamingAssistantMessage) {
            upsertVisibleMessage(streamingAssistantMessage)
          }
        }, 40)
      }

      const updateVisibleTurn = (turn: ConversationTurn) => {
        if (this.selectedConversationId !== turn.conversationId) {
          return
        }

        const turnIndex = this.turns.findIndex((item) => item.id === turn.id)

        if (turnIndex >= 0) {
          this.turns.splice(turnIndex, 1, turn)
        } else {
          this.turns.push(turn)
        }
      }

      try {
        const history = await loadConversationHistory(runConversation.id)
        const runContext: AgentRunContext = {
          project: runProject,
          conversation: runConversation,
          provider: runProvider,
          files: await loadProjectWorkspaceFiles(runProject.id),
          events: history.events,
        }
        const timestamp = now()
        conversationTurn = {
          id: createId('turn'),
          conversationId: runConversation.id,
          sequence: (history.turns.at(-1)?.sequence ?? -1) + 1,
          status: 'running',
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        await putRecord('conversationTurns', conversationTurn)
        updateVisibleTurn(conversationTurn)

        const userMessage: ChatMessage = {
          id: createId('message'),
          conversationId: runConversation.id,
          turnId: conversationTurn.id,
          sequence: eventSequence,
          stepSequence: 0,
          type: 'message',
          role: 'user',
          content,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        eventSequence += 1

        await putRecord('conversationEvents', userMessage)
        runContext.events.push(userMessage)

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

        const result = await runAgentConversation({
          systemPrompt,
          events: runContext.events,
          runContext,
          signal: abortController.signal,
          handlers: {
            createToolRun: (toolCall, stepSequence) => {
              const sequence = eventSequence
              eventSequence += 1

              return this.createToolRun(
                runConversation.id,
                conversationTurn!.id,
                sequence,
                stepSequence,
                runContext.events,
                toolCall,
              )
            },
            updateToolRun: (run, patch) => this.updateToolRun(runContext.events, run, patch),
            writeFile: (path, fileContent) =>
              this.upsertWorkspaceFile(runProject.id, runContext.files, path, fileContent),
            deleteFile: (path) => this.deleteWorkspaceFile(runProject.id, runContext.files, path),
            renameFile: (fromPath, toPath) =>
              this.renameWorkspaceFile(runProject.id, runContext.files, fromPath, toPath),
            deleteDirectory: (path) =>
              this.deleteWorkspaceDirectory(runProject.id, runContext.files, path),
            renameDirectory: (fromPath, toPath) =>
              this.renameWorkspaceDirectory(runProject.id, runContext.files, fromPath, toPath),
          },
          onAssistantStream: (streamedContent, stepSequence) => {
            const timestamp = now()

            streamingAssistantMessage = {
              id: streamingAssistantMessage?.id ?? createId('message'),
              conversationId: runConversation.id,
              turnId: conversationTurn!.id,
              sequence: streamingAssistantMessage?.sequence ?? eventSequence,
              stepSequence,
              type: 'message',
              role: 'assistant',
              content: streamedContent,
              createdAt: streamingAssistantMessage?.createdAt ?? timestamp,
              updatedAt: timestamp,
            }

            scheduleStreamRender()
          },
          onAssistantStreamReset: () => {
            cancelStreamRender()

            if (streamingAssistantMessage) {
              removeVisibleMessage(streamingAssistantMessage.id)
            }

            streamingAssistantMessage = undefined
          },
        })

        throwIfAborted(abortController.signal)
        const responseEndedAt = now()
        const assistantMessage: ChatMessage = {
          id: streamingAssistantMessage?.id ?? createId('message'),
          conversationId: runConversation.id,
          turnId: conversationTurn.id,
          sequence: streamingAssistantMessage?.sequence ?? eventSequence,
          stepSequence: result.finalStepSequence,
          type: 'message',
          role: 'assistant',
          content: result.content || emptyFinalMessage,
          createdAt: streamingAssistantMessage?.createdAt ?? responseEndedAt,
          updatedAt: responseEndedAt,
          responseDurationMs: responseEndedAt - userMessage.createdAt,
        }

        await putRecord('conversationEvents', assistantMessage)

        cancelStreamRender()
        upsertVisibleMessage(assistantMessage)

        streamingAssistantMessage = undefined

        const completedTurn: ConversationTurn = {
          ...conversationTurn,
          status: 'completed',
          updatedAt: responseEndedAt,
          completedAt: responseEndedAt,
          responseDurationMs: responseEndedAt - userMessage.createdAt,
        }
        await putRecord('conversationTurns', completedTurn)
        conversationTurn = completedTurn
        updateVisibleTurn(completedTurn)

      } finally {
        cancelStreamRender()

        if (streamingAssistantMessage) {
          removeVisibleMessage(streamingAssistantMessage.id)
        }

        if (conversationTurn?.status === 'running') {
          const endedAt = now()
          const endedTurn: ConversationTurn = {
            ...conversationTurn,
            status: abortController.signal.aborted ? 'stopped' : 'error',
            updatedAt: endedAt,
            completedAt: endedAt,
          }

          await putRecord('conversationTurns', endedTurn)
          conversationTurn = endedTurn
          updateVisibleTurn(endedTurn)
        }

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
