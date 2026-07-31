import manifestTemplate from '@/templates/presentation/manifest.json?raw'
import presentationRuntimeTemplate from '@/templates/presentation/runtime/main.js?raw'
import presentationStyleTemplate from '@/templates/presentation/runtime/style.css?raw'
import htmlTemplate from '@/templates/presentation/hp.html?raw'
import firstSlideTemplate from '@/templates/presentation/slides/slide-001.js?raw'
import vueBrowserRuntime from 'vue/dist/vue.esm-browser.prod.js?raw'

import { upsertProjectWorkspaceFile } from '@/services/agent/workspaceFiles'
import type { WorkspaceFile } from '@/types/agent'

interface PresentationManifest {
  name: string
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

function createManifest(projectName: string): string {
  const manifest = JSON.parse(manifestTemplate) as PresentationManifest
  manifest.name = projectName

  return `${JSON.stringify(manifest, null, 2)}\n`
}

function createTemplateFiles(projectName: string): PresentationTemplateFile[] {
  return [
    { path: 'manifest.json', content: createManifest(projectName) },
    { path: 'hp.html', content: htmlTemplate },
    { path: 'runtime/main.js', content: presentationRuntimeTemplate },
    { path: 'runtime/style.css', content: presentationStyleTemplate },
    { path: 'runtime/vue.esm-browser.prod.js', content: vueBrowserRuntime },
    { path: 'slides/slide-001.js', content: firstSlideTemplate },
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
