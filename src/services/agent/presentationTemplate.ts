import manifestTemplate from '@/templates/presentation/manifest.json?raw'
import presentationMainTemplate from '@/templates/presentation/main.js?raw'
import presentationRuntimeStyleTemplate from '@/templates/presentation/styles/runtime.css?raw'
import presentationSlidesStyleTemplate from '@/templates/presentation/styles/slides.css?raw'
import htmlTemplate from '@/templates/presentation/hp.html?raw'
import firstSlideTemplate from '@/templates/presentation/slides/slide-001.js?raw'
import vueBrowserRuntime from 'vue/dist/vue.esm-browser.prod.js?raw'

import { upsertProjectWorkspaceFile } from '@/services/agent/workspaceFiles'
import type { WorkspaceFile } from '@/types/agent'

interface PresentationManifest {
  size: {
    width: number
    height: number
  }
  navigation: {
    keyboard: {
      prev: string[]
      next: string[]
    }
  }
  slides: Array<{
    path: string
  }>
}

interface PresentationTemplateFile {
  path: string
  content: string
}

function createManifest(): string {
  const manifest = JSON.parse(manifestTemplate) as PresentationManifest

  return `${JSON.stringify(manifest, null, 2)}\n`
}

function createFirstSlide(projectName: string): string {
  return firstSlideTemplate.replace("'__PRESENTATION_TITLE__'", JSON.stringify(projectName))
}

function createTemplateFiles(projectName: string): PresentationTemplateFile[] {
  return [
    { path: 'manifest.json', content: createManifest() },
    { path: 'hp.html', content: htmlTemplate },
    { path: 'main.js', content: presentationMainTemplate },
    { path: 'assets/.gitkeep', content: '' },
    { path: 'runtime/vue.esm-browser.prod.js', content: vueBrowserRuntime },
    { path: 'scripts/.gitkeep', content: '' },
    { path: 'slides/slide-001.js', content: createFirstSlide(projectName) },
    { path: 'styles/runtime.css', content: presentationRuntimeStyleTemplate },
    { path: 'styles/slides.css', content: presentationSlidesStyleTemplate },
  ]
}

export async function initializePresentationWorkspace(
  projectId: string,
  projectName: string,
): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = []

  for (const templateFile of createTemplateFiles(projectName)) {
    await upsertProjectWorkspaceFile(
      projectId,
      files,
      templateFile.path,
      templateFile.content,
    )
  }

  return files
}
