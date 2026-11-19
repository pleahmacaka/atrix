import { MediaQuery } from "svelte/reactivity"
import { z } from "zod"
import { settings } from "./settings.svelte.ts"
import { persisted } from "./stored.svelte.ts"

const KEY = "shell"

const MIN_REM = 14

const MAX_REM = 30

const DEFAULT_REM = 18

export const RAIL_REM = 3

const savedSchema = z.object({
  width: z.number().catch(DEFAULT_REM),
  hidden: z.boolean().catch(false),
})

class Shell {
  #wide = new MediaQuery("(min-width: 64rem)")

  #narrow = new MediaQuery("(max-width: 40rem)")

  #saved = persisted(KEY, savedSchema.parse({}), savedSchema)

  width = $state(this.#saved.width)

  rail = $state(this.#saved.hidden)

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
      this.collapsed && !this.narrow && settings.sidebarCollapse === "compact"
    )
  }

  get overlay() {
    return this.collapsed && this.drawer
  }

  resize = (rem: number) => {
    this.width = Math.round(Math.min(MAX_REM, Math.max(MIN_REM, rem)))
    this.#save()
  }

  reset = () => {
    this.resize(DEFAULT_REM)
  }

  toggle = () => {
    if (!this.docked) {
      this.drawer = !this.drawer
      this.peek = false

      return
    }

    this.rail = !this.rail
    this.drawer = false
    this.#save()
  }

  openDrawer = () => {
    this.drawer = true
    this.peek = true
  }

  leaveDrawer = () => {
    if (this.peek) {
      this.drawer = false
    }
  }

  closeDrawer = () => {
    this.drawer = false
  }

  #save = () => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          width: this.width,
          hidden: this.rail,
        }),
      )
    } catch {
      return
    }
  }
}

export const shell = new Shell()
