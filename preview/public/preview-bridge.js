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

  postToParent('preview:ready')
  reportSlideChange()

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
