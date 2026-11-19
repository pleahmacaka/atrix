export type Prefs = {
  shell: string | null
  baud: number
}

const KEY = "atrix-terminal.prefs"

const read = (): Prefs => {
  try {
    const saved: Partial<Prefs> = JSON.parse(localStorage.getItem(KEY) ?? "{}")

    return { shell: saved.shell ?? null, baud: saved.baud ?? 115200 }
  } catch {
    return { shell: null, baud: 115200 }
  }
}

export const prefs = $state<Prefs>(read())

$effect.root(() => {
  $effect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  })
})

window.addEventListener("storage", e => {
  if (e.key === KEY) {
    Object.assign(prefs, read())
  }
})
