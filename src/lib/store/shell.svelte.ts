import { MediaQuery } from "svelte/reactivity"
import { z } from "zod"
import { persisted } from "./stored.svelte.ts"

const KEY = "shell"

const MIN_REM = 14

const MAX_REM = 30

const DEFAULT_REM = 18

export const RAIL_REM = 3.5

const savedSchema = z.object({
  width: z.number().catch(DEFAULT_REM),
  hidden: z.boolean().catch(false),
})

class Shell {
  #wide = new MediaQuery("(min-width: 64rem)")

  #saved = persisted(KEY, savedSchema.parse({}), savedSchema)

  width = $state(this.#saved.width)

  rail = $state(this.#saved.hidden)

  drawer = $state(false)

  get docked() {
    return this.#wide.current
  }

  get overlay() {
    return !this.docked && this.drawer
  }

  resize = (rem: number) => {
    this.width = Math.round(Math.min(MAX_REM, Math.max(MIN_REM, rem)))
    this.#save()
  }

  toggle = () => {
    if (!this.docked) {
      this.drawer = !this.drawer

      return
    }

    this.rail = !this.rail
    this.#save()
  }

  closeDrawer = () => {
    this.drawer = false
  }

  #save = () => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ width: this.width, hidden: this.rail }),
      )
    } catch {
      return
    }
  }
}

export const shell = new Shell()
