import { computed, createApp, defineAsyncComponent, markRaw, onBeforeUnmount, onMounted, ref } from './vue.esm-browser.prod.js'

const manifestUrl = new URL('../manifest.json', import.meta.url)
const manifest = await fetch(manifestUrl).then((response) => {
  if (!response.ok) {
    throw new Error(`Unable to load manifest.json (${response.status})`)
  }

  return response.json()
})

if (
  !Array.isArray(manifest.slides) ||
  manifest.slides.length === 0 ||
  !manifest.slides.every(
    (slide) =>
      slide &&
      typeof slide === 'object' &&
      typeof slide.path === 'string' &&
      slide.path.length > 0,
  )
) {
  throw new Error('manifest.json must contain at least one slide with a path')
}

document.title = manifest.name || 'Presentation'

const slideComponents = manifest.slides.map((slide) =>
  markRaw(
    defineAsyncComponent(async () => {
      const slideModule = await import(new URL(slide.path, manifestUrl).href)

      if (!slideModule.default) {
        throw new Error(`Slide ${slide.path} does not have a default export`)
      }

      return slideModule.default
    }),
  ),
)

const keyboardNavigation = {
  prev: Array.isArray(manifest.navigation?.keyboard?.prev)
    ? manifest.navigation.keyboard.prev
    : ['ArrowLeft', 'ArrowUp'],
  next: Array.isArray(manifest.navigation?.keyboard?.next)
    ? manifest.navigation.keyboard.next
    : ['ArrowRight', 'ArrowDown'],
}

function readHashState() {
  const params = new URLSearchParams(location.hash.slice(1))
  const requestedPage = Number.parseInt(params.get('slide') || '1', 10)
  const page = Number.isInteger(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), slideComponents.length)
    : 1

  return {
    page,
    thumbnail: params.get('mode') === 'thumbnail',
  }
}

function goToPage(page) {
  const state = readHashState()
  const nextPage = Math.min(Math.max(page, 1), slideComponents.length)

  if (nextPage === state.page) {
    return
  }

  const params = new URLSearchParams(location.hash.slice(1))
  params.set('slide', String(nextPage))
  location.hash = params.toString()
}

const PresentationApp = {
  setup() {
    const state = ref(readHashState())
    const currentSlide = computed(() => slideComponents[state.value.page - 1])

    function syncFromHash() {
      state.value = readHashState()
      document.documentElement.dataset.mode = state.value.thumbnail ? 'thumbnail' : 'preview'
    }

    function handleKeydown(event) {
      if (state.value.thumbnail) {
        return
      }

      if (keyboardNavigation.next.includes(event.key)) {
        event.preventDefault()
        goToPage(state.value.page + 1)
      } else if (keyboardNavigation.prev.includes(event.key)) {
        event.preventDefault()
        goToPage(state.value.page - 1)
      }
    }

    onMounted(() => {
      syncFromHash()
      window.addEventListener('hashchange', syncFromHash)
      window.addEventListener('keydown', handleKeydown)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('hashchange', syncFromHash)
      window.removeEventListener('keydown', handleKeydown)
    })

    return {
      currentSlide,
      manifest,
      state,
    }
  },
  template: `
    <component
      :is="currentSlide"
      :manifest="manifest"
      :page="state.page"
    />
  `,
}

createApp(PresentationApp).mount('#presentation')
