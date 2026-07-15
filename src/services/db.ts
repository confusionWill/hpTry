import type {
  Conversation,
  ConversationEvent,
  ConversationTurn,
  Project,
  Provider,
  WorkspaceAsset,
  WorkspaceFile,
} from '@/types/agent'

const DB_NAME = 'hpTry'
const DB_VERSION = 7

export type StoreName =
  | 'projects'
  | 'conversations'
  | 'conversationTurns'
  | 'conversationEvents'
  | 'providers'
  | 'workspaceAssets'
  | 'workspaceFiles'

export interface StoreMap {
  projects: Project
  conversations: Conversation
  conversationTurns: ConversationTurn
  conversationEvents: ConversationEvent
  providers: Provider
  workspaceAssets: WorkspaceAsset
  workspaceFiles: WorkspaceFile
}

let databasePromise: Promise<IDBDatabase> | null = null

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

      db.createObjectStore('projects', { keyPath: 'id' })

      const conversationStore = db.createObjectStore('conversations', { keyPath: 'id' })
      conversationStore.createIndex('projectId', 'projectId')

      const turnStore = db.createObjectStore('conversationTurns', { keyPath: 'id' })
      turnStore.createIndex('conversationId', 'conversationId')
      turnStore.createIndex('conversationSequence', ['conversationId', 'sequence'], {
        unique: true,
      })

      const eventStore = db.createObjectStore('conversationEvents', { keyPath: 'id' })
      eventStore.createIndex('conversationId', 'conversationId')
      eventStore.createIndex('turnId', 'turnId')

      db.createObjectStore('providers', { keyPath: 'id' })

      const workspaceFileStore = db.createObjectStore('workspaceFiles', { keyPath: 'id' })
      workspaceFileStore.createIndex('projectId', 'projectId')
      workspaceFileStore.createIndex('path', 'path')
      workspaceFileStore.createIndex('projectPath', ['projectId', 'path'], { unique: true })

      const workspaceAssetStore = db.createObjectStore('workspaceAssets', { keyPath: 'id' })
      workspaceAssetStore.createIndex('projectId', 'projectId')
      workspaceAssetStore.createIndex('path', 'path')
      workspaceAssetStore.createIndex('projectPath', ['projectId', 'path'], { unique: true })
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

export async function getRecordsByIndexCursor<TName extends StoreName>(
  storeName: TName,
  indexName: string,
  range: IDBKeyRange,
  direction: IDBCursorDirection,
  limit: number,
): Promise<StoreMap[TName][]> {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, 'readonly')
  const store = transaction.objectStore(storeName)
  const index = store.index(indexName)

  return new Promise((resolve, reject) => {
    const records: StoreMap[TName][] = []
    const request = index.openCursor(range, direction)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor || records.length >= limit) {
        resolve(records)
        return
      }

      records.push(cursor.value as StoreMap[TName])
      cursor.continue()
    }
  })
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
