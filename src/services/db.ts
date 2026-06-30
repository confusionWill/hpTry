import type {
  ChatMessage,
  Conversation,
  Project,
  Provider,
  ToolRun,
  WorkspaceFile,
} from '@/types/agent'

const DB_NAME = 'hp-will'
const DB_VERSION = 3

export type StoreName =
  | 'projects'
  | 'conversations'
  | 'messages'
  | 'providers'
  | 'workspaceFiles'
  | 'toolRuns'

export interface StoreMap {
  projects: Project
  conversations: Conversation
  messages: ChatMessage
  providers: Provider
  workspaceFiles: WorkspaceFile
  toolRuns: ToolRun
}

let databasePromise: Promise<IDBDatabase> | null = null

function ensureIndex(
  store: IDBObjectStore,
  indexName: string,
  keyPath: string | string[],
  options?: IDBIndexParameters,
): void {
  if (!store.indexNames.contains(indexName)) {
    store.createIndex(indexName, keyPath, options)
  }
}

function dedupeWorkspaceFilesBeforeProjectPathIndex(store: IDBObjectStore): void {
  const seen = new Set<string>()
  const cursorRequest = store.openCursor()

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result

    if (!cursor) {
      ensureIndex(store, 'projectPath', ['projectId', 'path'], { unique: true })
      return
    }

    const file = cursor.value as WorkspaceFile
    const key = `${file.projectId}\0${file.path}`

    if (seen.has(key)) {
      cursor.delete()
    } else {
      seen.add(key)
    }

    cursor.continue()
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains('conversations')) {
        const store = db.createObjectStore('conversations', { keyPath: 'id' })
        store.createIndex('projectId', 'projectId')
      } else {
        const store = request.transaction?.objectStore('conversations')

        if (store) {
          ensureIndex(store, 'projectId', 'projectId')
        }
      }

      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' })
        store.createIndex('conversationId', 'conversationId')
      } else {
        const store = request.transaction?.objectStore('messages')

        if (store) {
          ensureIndex(store, 'conversationId', 'conversationId')
        }
      }

      if (!db.objectStoreNames.contains('providers')) {
        db.createObjectStore('providers', { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains('workspaceFiles')) {
        const store = db.createObjectStore('workspaceFiles', { keyPath: 'id' })
        store.createIndex('projectId', 'projectId')
        store.createIndex('path', 'path')
        store.createIndex('projectPath', ['projectId', 'path'], { unique: true })
      } else {
        const store = request.transaction?.objectStore('workspaceFiles')

        if (store) {
          ensureIndex(store, 'projectId', 'projectId')
          ensureIndex(store, 'path', 'path')
          dedupeWorkspaceFilesBeforeProjectPathIndex(store)
        }
      }

      if (!db.objectStoreNames.contains('toolRuns')) {
        const store = db.createObjectStore('toolRuns', { keyPath: 'id' })
        store.createIndex('conversationId', 'conversationId')
      } else {
        const store = request.transaction?.objectStore('toolRuns')

        if (store) {
          ensureIndex(store, 'conversationId', 'conversationId')
        }
      }
    }
  })

  return databasePromise
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getAllRecords<TName extends StoreName>(
  storeName: TName,
): Promise<StoreMap[TName][]> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readonly')
  const store = transaction.objectStore(storeName)

  return requestResult<StoreMap[TName][]>(store.getAll())
}

export async function getRecord<TName extends StoreName>(
  storeName: TName,
  id: string,
): Promise<StoreMap[TName] | undefined> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readonly')
  const store = transaction.objectStore(storeName)

  return requestResult<StoreMap[TName] | undefined>(store.get(id))
}

export async function putRecord<TName extends StoreName>(
  storeName: TName,
  record: StoreMap[TName],
): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).put(record)
  await transactionDone(transaction)
}

export async function deleteRecord(storeName: StoreName, id: string): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).delete(id)
  await transactionDone(transaction)
}

export async function getRecordsByIndex<TName extends StoreName>(
  storeName: TName,
  indexName: string,
  value: IDBValidKey | IDBKeyRange,
): Promise<StoreMap[TName][]> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readonly')
  const store = transaction.objectStore(storeName)
  const index = store.index(indexName)

  return requestResult<StoreMap[TName][]>(index.getAll(value))
}

export async function deleteRecordsByIndex(
  storeName: StoreName,
  indexName: string,
  value: IDBValidKey | IDBKeyRange,
): Promise<void> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readwrite')
  const store = transaction.objectStore(storeName)
  const index = store.index(indexName)
  const keys = await requestResult<IDBValidKey[]>(index.getAllKeys(value))

  keys.forEach((key) => store.delete(key))
  await transactionDone(transaction)
}
