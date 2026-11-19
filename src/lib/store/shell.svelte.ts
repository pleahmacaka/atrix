import { MediaQuery } from "svelte/reactivity"
import { z } from "zod"
import { settings } from "./settings.svelte.ts"
import { persist, persisted } from "./stored.svelte.ts"

const KEY = "shell"

const BOUNDS = { min: 14, max: 30, base: 18 }

export const RAIL_REM = 3

const savedSchema = z.object({
  width: z.number().catch(BOUNDS.base),
  hidden: z.boolean().catch(false),
})

const saved = persisted(KEY, savedSchema.parse({}), savedSchema)

const save = (width: number, rail: boolean) => {
  try {
    persist(KEY, { width, hidden: rail }, savedSchema.parse({}))
  } catch {}
}

class Shell {
  #wide = new MediaQuery("(min-width: 64rem)")

  #narrow = new MediaQuery("(max-width: 40rem)")

  width = $state(saved.width)

  rail = $state(saved.hidden)

  drawer = $state(false)

  peek = $state(false)

  get docked() {
    return this.#wide.current
  }

  get collapsed() {
    return !this.docked || this.rail
  }

  get narrow() {
    return this.#narrow.current
  }

  get compact() {
    return (
      !this.docked && !this.narrow && settings.sidebarCollapse === "compact"
    )
  }

  get overlay() {
    return this.collapsed && this.drawer
  }

  resize = (rem: number) => {
    this.width = Math.round(Math.min(BOUNDS.max, Math.max(BOUNDS.min, rem)))
    save(this.width, this.rail)
  }

  reset = () => {
    this.resize(BOUNDS.base)
  }

  toggle = () => {
    if (!this.docked) {
      this.drawer = !this.drawer
      this.peek = false

      return
    }

    this.rail = !this.rail
    this.drawer = false
    save(this.width, this.rail)
  }

  openDrawer = () => {
    this.drawer = true
    this.peek = true
  }

  closeDrawer = () => {
    this.drawer = false
  }

  leaveDrawer = () => {
    if (this.peek) {
      this.drawer = false
    }
  }
}

export const shell = new Shell()
