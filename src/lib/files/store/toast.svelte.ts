export type ToastKind = "success" | "error" | "info"

export type ToastItem = { id: number; kind: ToastKind; text: string }

const LIFE_MS = 3500

export const toasts = $state<ToastItem[]>([])

let seq = 0

export const toast = (text: string, kind: ToastKind = "info") => {
  const id = ++seq

  toasts.push({ id, kind, text })

  setTimeout(() => {
    const at = toasts.findIndex(entry => entry.id === id)

    if (at >= 0) {
      toasts.splice(at, 1)
    }
  }, LIFE_MS)
}
