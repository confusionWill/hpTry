import { useI18n } from 'vue-i18n'

import { useAgentStore } from '@/stores/agent'
import { useUiStore } from '@/stores/ui'

export function isHpProjectFile(file: File): boolean {
  return /\.hp$/i.test(file.name)
}

export function useProjectImport() {
  const store = useAgentStore()
  const uiStore = useUiStore()
  const { t } = useI18n()

  async function importProjectFile(file: File): Promise<boolean> {
    try {
      await store.importProject(file)
      uiStore.showToast(
        t('project.openSuccess', { name: store.selectedProject?.name ?? file.name }),
      )
      return true
    } catch {
      uiStore.showToast(t('project.openFailed'), 'error')
      return false
    }
  }

  return {
    importProjectFile,
  }
}
