export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export function now(): number {
  return Date.now()
}

export function sortUpdated<T extends { updatedAt: number }>(records: T[]): T[] {
  return [...records].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function sortCreated<T extends { createdAt: number }>(records: T[]): T[] {
  return [...records].sort((a, b) => a.createdAt - b.createdAt)
}
