(() => {
  const PROTOCOL_VERSION = 2
  const searchParams = new URLSearchParams(window.location.search)
  const session = searchParams.get('__hpSession') ?? ''
  const projectId = searchParams.get('__hpProjectId') ?? ''
  const version = searchParams.get('v') ?? ''
  const parentOrigin = parseOrigin(searchParams.get('__hpParentOrigin'))
  const parentWindow = window.parent
  const initialHashParams = new URLSearchParams(window.location.hash.slice(1))

  if (
    !session ||
    !projectId ||
    !version ||
    !parentOrigin ||
    parentWindow === window ||
    initialHashParams.get('mode') === 'thumbnail'
  ) {
    return
  }

  window.addEventListener('message', handleParentMessage)
  window.addEventListener('hashchange', reportSlideChange)
  window.addEventListener('error', reportWindowError, true)
  window.addEventListener('unhandledrejection', reportUnhandledRejection)
  captureConsoleErrors()

  postToParent('preview:ready')
  if (document.readyState === 'complete') {
    reportPreviewLoaded()
  } else {
    window.addEventListener('load', reportPreviewLoaded, { once: true })
  }
  reportSlideChange()

  function reportPreviewLoaded() {
    postToParent('preview:loaded')
  }

  function reportWindowError(event) {
    if (event instanceof ErrorEvent) {
      postRuntimeError({
        kind: 'runtime',
        message: event.message || 'Unknown runtime error',
        source: event.filename || window.location.href,
        line: event.lineno,
        column: event.colno,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      })
      return
    }

    const target = event.target

    if (!(target instanceof Element)) {
      return
    }

    const source = target.currentSrc || target.src || target.href || ''
    const tagName = target.tagName.toLowerCase()
    postRuntimeError({
      kind: 'resource',
      message: `Failed to load ${tagName} resource${source ? `: ${source}` : ''}`,
      source: source || window.location.href,
    })
  }

  function reportUnhandledRejection(event) {
    const reason = event.reason
    postRuntimeError({
      kind: 'unhandled-rejection',
      message: formatValue(reason) || 'Unhandled promise rejection',
      source: window.location.href,
      stack: reason instanceof Error ? reason.stack : undefined,
    })
  }

  function captureConsoleErrors() {
    const originalError = console.error

    console.error = (...args) => {
      try {
        postRuntimeError({
          kind: 'console',
          message: args.map(formatValue).join(' ') || 'console.error',
          source: window.location.href,
          stack: args.find((value) => value instanceof Error)?.stack,
        })
      } finally {
        originalError.apply(console, args)
      }
    }
  }

  function postRuntimeError(error) {
    postToParent('preview:runtime-error', {
      error: {
        ...error,
        message: truncate(error.message, 4000),
        source: truncate(error.source, 2000),
        stack: truncate(error.stack, 8000),
        timestamp: Date.now(),
      },
    })
  }

  function formatValue(value) {
    if (value instanceof Error) {
      return value.message || value.name
    }

    if (typeof value === 'string') {
      return value
    }

    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  function truncate(value, maxLength) {
    return typeof value === 'string' && value.length > maxLength
      ? `${value.slice(0, maxLength)}…`
      : value
  }

  function handleParentMessage(event) {
    const message = event.data

    if (
      event.origin !== parentOrigin ||
      event.source !== parentWindow ||
      !isRecord(message) ||
      message.protocol !== PROTOCOL_VERSION ||
      message.type !== 'preview:set-slide' ||
      message.session !== session ||
      !Number.isInteger(message.page) ||
      message.page < 1
    ) {
      return
    }

    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    hashParams.set('slide', String(message.page))
    hashParams.delete('mode')

    const nextHash = hashParams.toString()

    if (window.location.hash.slice(1) !== nextHash) {
      window.location.hash = nextHash
    }
  }

  function reportSlideChange() {
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const page = Number.parseInt(hashParams.get('slide') ?? '', 10)

    if (!Number.isInteger(page) || page < 1) {
      return
    }

    postToParent('preview:slide-change', { page })
  }

  function postToParent(type, payload = {}) {
    parentWindow.postMessage(
      {
        protocol: PROTOCOL_VERSION,
        type,
        target: 'document',
        session,
        projectId,
        version,
        ...payload,
      },
      parentOrigin,
    )
  }

  function parseOrigin(value) {
    if (!value) {
      return null
    }

    try {
      return new URL(value).origin
    } catch {
      return null
    }
  }

  function isRecord(value) {
    return typeof value === 'object' && value !== null
  }
})()
