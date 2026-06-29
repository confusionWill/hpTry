import { defineStore } from 'pinia'

export type ToastType = 'success' | 'warning' | 'error' | 'info'
export type ConfirmType = 'warning' | 'danger' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
}

export interface ConfirmOptions {
  title: string
  message: string
  confirmText: string
  cancelText: string
  type?: ConfirmType
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    toasts: [] as ToastItem[],
    confirm: null as PendingConfirm | null,
  }),
  actions: {
    showToast(message: string, type: ToastType = 'info') {
      const toast: ToastItem = {
        id: createId('toast'),
        message,
        type,
      }

      this.toasts = [...this.toasts, toast]

      window.setTimeout(() => {
        this.dismissToast(toast.id)
      }, 3000)
    },
    dismissToast(toastId: string) {
      this.toasts = this.toasts.filter((toast) => toast.id !== toastId)
    },
    requestConfirm(options: ConfirmOptions): Promise<boolean> {
      return new Promise((resolve) => {
        this.confirm = {
          ...options,
          type: options.type ?? 'warning',
          resolve,
        }
      })
    },
    resolveConfirm(confirmed: boolean) {
      const pendingConfirm = this.confirm

      if (!pendingConfirm) {
        return
      }

      this.confirm = null
      pendingConfirm.resolve(confirmed)
    },
  },
})
