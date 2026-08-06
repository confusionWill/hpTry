import { defineStore } from 'pinia'

import {
  generateConversationTitle,
  runAgentConversation,
  type AgentRunContext,
} from '@/services/agent/runner'
import { ChatCompletionRequestError } from '@/services/openai'
import {
  createDefaultProvider,
  DEFAULT_PROVIDER_ID,
  isDefaultProvider,
  sortProviders,
} from '@/services/providers'
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
  clearDemoPreviewWorkspaces,
  clearTemporaryWorkspaceFiles,
  createDemoPreviewProjectId,
  deleteDemoPreviewWorkspace,
  deleteProjectWorkspaceFile,
  deleteProjectWorkspaceDirectory,
  loadProjectWorkspaceFiles,
  renameProjectWorkspaceFile,
  renameProjectWorkspaceDirectory,
  upsertProjectWorkspaceAsset,
  upsertProjectWorkspaceFile,
} from '@/services/agent/workspaceFiles'
import { initializePresentationWorkspace } from '@/services/agent/presentationTemplate'
import { exportWorkspaceAsHp, importWorkspaceFromHp } from '@/services/agent/workspaceExport'
import { loadDemoCase } from '@/services/demoCases'
import type {
  AgentUiContext,
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

interface DemoPreviewSession {
  caseId: string
  project: Project
  returnProjectId: string
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
    activeDemoPreview: null as DemoPreviewSession | null,
    selectedProjectId: '',
    selectedConversationId: '',
    selectedProviderId: '',
    selectedWorkspaceFilePath: '',
    draftConversationProjectId: '',
    loading: false,
    exportingHp: false,
    activeRuns: [] as ActiveAgentRun[],
    stoppingConversationIds: [] as string[],
    projectLoadToken: 0,
    conversationLoadToken: 0,
    loadingOlderTurns: false,
    hasOlderTurns: false,
    demoLoadToken: 0,
  }),
  getters: {
    selectedProject(state): Project | undefined {
      if (state.activeDemoPreview?.project.id === state.selectedProjectId) {
        return state.activeDemoPreview.project
      }

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
        await clearDemoPreviewWorkspaces(this.activeDemoPreview?.project.id)
        this.projects = sortUpdated(await getAllRecords('projects'))
        const storedProviders = await getAllRecords('providers')
        const defaultProvider = storedProviders.find(isDefaultProvider)

        if (!defaultProvider) {
          const provider = createDefaultProvider()
          await putRecord('providers', provider)
          storedProviders.push(provider)
        }

        this.providers = sortProviders(storedProviders)

        if (!this.selectedProjectId && this.projects[0]) {
          const savedProjectId = loadSelectedProjectId()
          const project = this.projects.find((item) => item.id === savedProjectId)
          this.selectedProjectId = project?.id ?? this.projects[0].id
        }

        if (!this.selectedProviderId) {
          const savedProviderId = loadSelectedProviderId()
          const provider = this.providers.find((item) => item.id === savedProviderId)
          this.selectProvider(provider?.id ?? DEFAULT_PROVIDER_ID)
        }

        if (this.selectedProjectId) {
          await this.selectProject(this.selectedProjectId)
        }
      } finally {
        this.loading = false
      }
    },
    async openDemoPreview(caseId: string, builtInDemoName: string): Promise<boolean> {
      const loadToken = this.demoLoadToken + 1
      this.demoLoadToken = loadToken
      const imported = await loadDemoCase(caseId, builtInDemoName)

      if (this.demoLoadToken !== loadToken) {
        return false
      }

      const currentDemo = this.activeDemoPreview
      const returnProjectId =
        currentDemo?.returnProjectId ||
        (this.projects.some((project) => project.id === this.selectedProjectId)
          ? this.selectedProjectId
          : loadSelectedProjectId())

      if (currentDemo) {
        await deleteDemoPreviewWorkspace(currentDemo.project.id)
      }

      const timestamp = now()
      const project: Project = {
        id: createDemoPreviewProjectId(),
        name: imported.name,
        description: '',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      const workspaceFiles: WorkspaceFile[] = []

      try {
        for (const importedFile of imported.files) {
          if (importedFile.kind === 'asset' && importedFile.blob) {
            await upsertProjectWorkspaceAsset(
              project.id,
              workspaceFiles,
              importedFile.path,
              importedFile.blob,
              importedFile.name ?? importedFile.path.split('/').pop() ?? importedFile.path,
              importedFile.mimeType ?? 'application/octet-stream',
            )
            continue
          }

          await upsertProjectWorkspaceFile(
            project.id,
            workspaceFiles,
            importedFile.path,
            importedFile.content ?? '',
          )
        }
      } catch (error) {
        await deleteDemoPreviewWorkspace(project.id)
        throw error
      }

      if (this.demoLoadToken !== loadToken) {
        await deleteDemoPreviewWorkspace(project.id)
        return false
      }

      this.activeDemoPreview = {
        caseId,
        project,
        returnProjectId,
      }
      this.projectLoadToken += 1
      this.conversationLoadToken += 1
      this.selectedProjectId = project.id
      this.conversations = []
      this.turns = []
      this.events = []
      this.workspaceFiles = workspaceFiles
      this.selectedConversationId = ''
      this.selectedWorkspaceFilePath = workspaceFiles[0]?.path ?? ''
      this.draftConversationProjectId = ''
      this.hasOlderTurns = false
      this.loadingOlderTurns = false

      return true
    },
    async closeDemoPreview(): Promise<void> {
      this.demoLoadToken += 1
      const demo = this.activeDemoPreview

      if (!demo) {
        return
      }

      this.activeDemoPreview = null
      this.projectLoadToken += 1
      this.conversationLoadToken += 1
      this.selectedProjectId = ''
      this.conversations = []
      this.turns = []
      this.events = []
      this.workspaceFiles = []
      this.selectedConversationId = ''
      this.selectedWorkspaceFilePath = ''
      this.draftConversationProjectId = ''
      this.hasOlderTurns = false
      this.loadingOlderTurns = false

      await deleteDemoPreviewWorkspace(demo.project.id)

      const returnProject =
        this.projects.find((project) => project.id === demo.returnProjectId) ?? this.projects[0]

      if (returnProject) {
        await this.selectProject(returnProject.id)
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
      const shouldStartNewConversation = startNewConversation || this.conversations.length === 0
      this.selectedConversationId = shouldStartNewConversation
        ? ''
        : (this.conversations[0]?.id ?? '')
      this.draftConversationProjectId = shouldStartNewConversation ? projectId : ''
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
    async importProject(file: File) {
      const imported = await importWorkspaceFromHp(file)
      const timestamp = now()
      const project: Project = {
        id: createId('project'),
        name: imported.name,
        description: '',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      const workspaceFiles: WorkspaceFile[] = []

      await putRecord('projects', project)

      try {
        for (const importedFile of imported.files) {
          if (importedFile.kind === 'asset' && importedFile.blob) {
            await upsertProjectWorkspaceAsset(
              project.id,
              workspaceFiles,
              importedFile.path,
              importedFile.blob,
              importedFile.name ?? importedFile.path.split('/').pop() ?? importedFile.path,
              importedFile.mimeType ?? 'application/octet-stream',
            )
            continue
          }

          await upsertProjectWorkspaceFile(
            project.id,
            workspaceFiles,
            importedFile.path,
            importedFile.content ?? '',
          )
        }
      } catch (error) {
        await deleteRecordsByIndex('workspaceFiles', 'projectId', project.id)
        await deleteRecordsByIndex('workspaceAssets', 'projectId', project.id)
        await deleteRecord('projects', project.id)
        throw error
      }

      this.projects = sortUpdated([...this.projects, project])
      await this.selectProject(project.id, true)
    },
    async renameProject(projectId: string, name: string) {
      const project = this.projects.find((item) => item.id === projectId)
      const trimmedName = name.trim()

      if (!project || !trimmedName || project.name === trimmedName) {
        return
      }

      const updatedProject: Project = {
        ...project,
        name: trimmedName,
        updatedAt: now(),
      }

      await putRecord('projects', updatedProject)
      this.projects = sortUpdated(
        this.projects.map((item) => (item.id === projectId ? updatedProject : item)),
      )
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

      if (this.selectedProjectId !== projectId) {
        return
      }

      const nextProjectId = this.projects[0]?.id ?? ''

      if (nextProjectId) {
        await this.selectProject(nextProjectId)
      } else {
        this.projectLoadToken += 1
        this.conversationLoadToken += 1
        this.selectedProjectId = ''
        saveSelectedProjectId('')
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
      this.draftConversationProjectId =
        this.conversations.length === 0 ? this.selectedProjectId : ''
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
      const provider = isDefaultProvider({ id: providerId ?? '' })
        ? {
            ...createDefaultProvider(payload.apiKey.trim(), timestamp),
            createdAt: existing?.createdAt ?? timestamp,
          }
        : {
            id: existing?.id ?? createId('provider'),
            name: payload.name.trim(),
            baseUrl: payload.baseUrl.trim(),
            apiKey: payload.apiKey.trim(),
            model: payload.model.trim(),
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
          }

      await putRecord('providers', provider)
      this.providers = sortProviders([
        ...this.providers.filter((item) => item.id !== provider.id),
        provider,
      ])
      this.selectProvider(provider.id)
    },
    async deleteProvider(providerId: string) {
      if (providerId === DEFAULT_PROVIDER_ID) {
        return
      }

      await deleteRecord('providers', providerId)
      this.providers = this.providers.filter((provider) => provider.id !== providerId)
      this.selectProvider(this.providers[0]?.id ?? '')
    },
    async upsertWorkspaceFile(
      projectId: string,
      files: WorkspaceFile[],
      path: string,
      content: string,
      selectFile = true,
    ): Promise<WorkspaceFile> {
      const file = await upsertProjectWorkspaceFile(projectId, files, path, content)

      if (this.selectedProjectId === projectId) {
        this.workspaceFiles = [...files]
        if (selectFile) {
          this.selectedWorkspaceFilePath = file.path
        }
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
      reasoningContent?: string,
      assistantContent?: string,
      replaceVisibleEventId?: string,
    ): Promise<ToolRun> {
      const timestamp = now()
      const run: ToolRun = {
        id: replaceVisibleEventId ?? createId('tool'),
        conversationId,
        turnId,
        sequence,
        stepSequence,
        type: 'tool',
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        assistantContent,
        reasoningContent,
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
        const visibleEventIndex = this.events.findIndex((event) => event.id === run.id)

        if (visibleEventIndex >= 0) {
          this.events.splice(visibleEventIndex, 1, run)
        } else {
          this.events.push(run)
        }
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
      uiContext?: AgentUiContext,
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
          uiContext,
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
            createToolRun: async (
              toolCall,
              stepSequence,
              reasoningContent,
              assistantContent,
            ) => {
              const sequence = eventSequence
              eventSequence += 1
              const replaceVisibleEventId =
                streamingAssistantMessage?.stepSequence === stepSequence
                  ? streamingAssistantMessage.id
                  : undefined

              const run = await this.createToolRun(
                runConversation.id,
                conversationTurn!.id,
                sequence,
                stepSequence,
                runContext.events,
                toolCall,
                reasoningContent,
                assistantContent,
                replaceVisibleEventId,
              )

              if (replaceVisibleEventId) {
                streamingAssistantMessage = undefined
              }

              return run
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
              upsertVisibleMessage(streamingAssistantMessage)
            }
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
    async exportCurrentWorkspaceHp() {
      if (!this.selectedProject || this.workspaceFiles.length === 0) {
        return
      }

      this.exportingHp = true
      try {
        await exportWorkspaceAsHp(this.selectedProject, this.workspaceFiles)
      } finally {
        this.exportingHp = false
      }
    },
  },
})
