import { createPresentationTemplateFiles } from '@/services/agent/presentationTemplate'
import {
  importWorkspaceFromHp,
  type ImportedWorkspace,
} from '@/services/agent/workspaceExport'

const CASE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

export const BUILT_IN_DEMO_CASE_ID = 'welcome'

export function isValidDemoCaseId(caseId: string): boolean {
  return CASE_ID_PATTERN.test(caseId)
}

export async function loadDemoCase(
  caseId: string,
  builtInDemoName: string,
): Promise<ImportedWorkspace> {
  if (!isValidDemoCaseId(caseId)) {
    throw new Error('Invalid demo case ID')
  }

  if (caseId === BUILT_IN_DEMO_CASE_ID) {
    return {
      name: builtInDemoName,
      files: createPresentationTemplateFiles(builtInDemoName).map((file) => ({
        ...file,
        kind: 'text' as const,
      })),
    }
  }

  const response = await fetch(`/demos/${encodeURIComponent(caseId)}.hp`, {
    credentials: 'same-origin',
  })

  if (!response.ok) {
    throw new Error(`Demo case request failed with status ${response.status}`)
  }

  const blob = await response.blob()
  const file = new File([blob], `${caseId}.hp`, {
    type: blob.type || 'application/octet-stream',
  })

  return importWorkspaceFromHp(file)
}
