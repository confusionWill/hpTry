const PROTOCOL_VERSION = 2
const REQUEST_TIMEOUT_MS = 10_000

interface PreviewFileRequest {
  protocol: typeof PROTOCOL_VERSION
  type: 'preview:file-request'
  requestId: string
  session: string
  projectId: string
  version: string
  path: string
}

interface PendingWorkerRequest {
  request: PreviewFileRequest
  responsePort: MessagePort
  timeout: ReturnType<typeof setTimeout>
}

const searchParams = new URLSearchParams(window.location.search)
const session = searchParams.get('session') ?? ''
const parentOrigin = parseOrigin(searchParams.get('parentOrigin'))
const attempt = Number.parseInt(searchParams.get('attempt') ?? '', 10)
const trustedParent = window.parent

if (
  !session ||
  !parentOrigin ||
  !Number.isInteger(attempt) ||
  attempt < 0 ||
  trustedParent === window
) {
  throw new Error('Invalid preview host initialization')
}

const trustedParentOrigin = parentOrigin
let parentPort: MessagePort | null = null
const pendingWorkerRequests = new Map<string, PendingWorkerRequest>()

window.addEventListener('message', handleParentMessage)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', handleWorkerMessage)
}
void initializePreviewWorker()

async function initializePreviewWorker() {
  if (!('serviceWorker' in navigator)) {
    reportHostError('Service Worker is unavailable')
    return
  }

  try {
    const registration = await navigator.serviceWorker.register('/preview-worker.js', {
      scope: '/',
      updateViaCache: 'none',
    })
    await waitForWorkerActivation(registration)
    await navigator.serviceWorker.ready
    requestParentChannel()
  } catch {
    reportHostError('Unable to initialize the preview worker')
  }
}

function handleParentMessage(event: MessageEvent) {
  if (
    event.origin !== trustedParentOrigin ||
    event.source !== trustedParent ||
    !isRecord(event.data) ||
    event.data.protocol !== PROTOCOL_VERSION ||
    event.data.type !== 'preview:channel' ||
    event.data.session !== session
  ) {
    return
  }

  const nextParentPort = event.ports[0]

  if (!nextParentPort) {
    reportHostError('Preview channel is unavailable')
    return
  }

  parentPort?.close()
  parentPort = nextParentPort
  parentPort.onmessageerror = reconnectParentChannel
  parentPort.start()
  parentPort.postMessage({
    protocol: PROTOCOL_VERSION,
    type: 'preview:channel-ready',
    session,
  })
  flushPendingWorkerRequests()
}

function handleWorkerMessage(event: MessageEvent) {
  if (!isPreviewFileRequest(event.data) || event.data.session !== session) {
    return
  }

  const responsePort = event.ports[0]

  if (!responsePort) {
    return
  }

  const request = event.data
  const timeout = setTimeout(() => {
    pendingWorkerRequests.delete(request.requestId)
    respondUnavailable(responsePort, request.requestId)
  }, REQUEST_TIMEOUT_MS)

  pendingWorkerRequests.set(request.requestId, {
    request,
    responsePort,
    timeout,
  })

  if (!forwardWorkerRequest(request, responsePort)) {
    requestParentChannel()
  }
}

function forwardWorkerRequest(request: PreviewFileRequest, responsePort: MessagePort): boolean {
  if (!parentPort) {
    return false
  }

  try {
    parentPort.postMessage(request, [responsePort])
    clearPendingWorkerRequest(request.requestId)
    return true
  } catch {
    parentPort.close()
    parentPort = null
    return false
  }
}

function flushPendingWorkerRequests() {
  if (!parentPort) {
    return
  }

  for (const pending of [...pendingWorkerRequests.values()]) {
    if (!forwardWorkerRequest(pending.request, pending.responsePort)) {
      requestParentChannel()
      return
    }
  }
}

function clearPendingWorkerRequest(requestId: string) {
  const pending = pendingWorkerRequests.get(requestId)

  if (!pending) {
    return
  }

  clearTimeout(pending.timeout)
  pendingWorkerRequests.delete(requestId)
}

function reconnectParentChannel() {
  parentPort?.close()
  parentPort = null
  requestParentChannel()
}

function requestParentChannel() {
  trustedParent.postMessage(
    {
      protocol: PROTOCOL_VERSION,
      type: 'preview:channel-request',
      target: 'host',
      session,
      attempt,
    },
    trustedParentOrigin,
  )
}

function reportHostError(message: string) {
  trustedParent.postMessage(
    {
      protocol: PROTOCOL_VERSION,
      type: 'preview:error',
      target: 'host',
      session,
      message,
    },
    trustedParentOrigin,
  )
}

function respondUnavailable(port: MessagePort, requestId: string) {
  try {
    port.postMessage({
      protocol: PROTOCOL_VERSION,
      type: 'preview:file-response',
      requestId,
      status: 503,
      message: 'Preview source is unavailable',
    })
  } finally {
    port.close()
  }
}

function isPreviewFileRequest(value: unknown): value is PreviewFileRequest {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.protocol === PROTOCOL_VERSION &&
    value.type === 'preview:file-request' &&
    isNonEmptyString(value.requestId) &&
    isNonEmptyString(value.session) &&
    isNonEmptyString(value.projectId) &&
    isNonEmptyString(value.version) &&
    isNonEmptyString(value.path)
  )
}

function waitForWorkerActivation(registration: ServiceWorkerRegistration): Promise<void> {
  const worker = registration.installing ?? registration.waiting ?? registration.active

  if (!worker || worker.state === 'activated') {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        resolve()
      } else if (worker.state === 'redundant') {
        reject(new Error('Preview worker became redundant'))
      }
    })
  })
}

function parseOrigin(value: string | null): string | null {
  if (!value) {
    return null
  }

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
