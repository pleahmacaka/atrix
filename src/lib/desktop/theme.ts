import {
  ACCENTS,
  type Bounds,
  settings,
  TERMINAL_SCROLL,
  TERMINAL_SIZE,
  TERMINAL_WEIGHT,
} from "#lib/store/settings.svelte.ts"

const THEMES = ["system", "light", "dark"] as const

const ranged =
  (range: Bounds, apply: (value: number) => void) => (raw: string) => {
    const value = Number(raw)

    if (Number.isFinite(value) && value >= range.min && value <= range.max) {
      apply(value)
    }
  }

const FOLLOWED: Record<string, (raw: string) => void> = {
  theme: raw => {
    settings.theme = THEMES.find(t => t === raw) ?? "system"
  },
  accent: raw => {
    settings.accent = ACCENTS.find(a => a.id === raw)?.id ?? "indigo"
  },
  "interface-font": raw => {
    settings.interfaceFont = raw
  },
  "panel-shape": raw => {
    settings.shape = raw === "square" ? "square" : "rounded"
  },
  "terminal-font": raw => {
    settings.terminalFont = raw
  },
  "terminal-size": ranged(TERMINAL_SIZE, value => {
    settings.terminalSize = value
  }),
  "terminal-weight": ranged(TERMINAL_WEIGHT, value => {
    settings.terminalWeight = value
  }),
  "terminal-scroll": ranged(TERMINAL_SCROLL, value => {
    settings.terminalScroll = value
  }),
}

export const followSettings = (e: StorageEvent) => {
  if (e.key !== null && e.newValue !== null) {
    FOLLOWED[e.key]?.(e.newValue)
  }
}
