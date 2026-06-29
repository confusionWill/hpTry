import type {
  ChatMessage,
  Conversation,
  Project,
  Provider,
} from '@/types/agent'

const DB_NAME = 'browser-agent-db'
const DB_VERSION = 1

export type StoreName = 'projects' | 'conversations' | 'messages' | 'providers'

export interface StoreMap {
  projects: Project
  conversations: Conversation
  messages: ChatMessage
  providers: Provider
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

      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' })
      }

      if (!db.objectStoreNames.contains('conversations')) {
        const store = db.createObjectStore('conversations', { keyPath: 'id' })
        store.createIndex('projectId', 'projectId')
      }

      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' })
        store.createIndex('conversationId', 'conversationId')
      }

      if (!db.objectStoreNames.contains('providers')) {
        db.createObjectStore('providers', { keyPath: 'id' })
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
