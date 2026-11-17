import { relaunch } from "@tauri-apps/plugin-process"
import { check, type Update } from "@tauri-apps/plugin-updater"
import { errorText } from "#lib/components/ui/attempt.svelte.ts"

type Phase =
  | "idle"
  | "checking"
  | "latest"
  | "found"
  | "downloading"
  | "ready"
  | "installing"

class Updater {
  phase = $state<Phase>("idle")

  version = $state<string | null>(null)

  percent = $state(0)

  failure = $state<string | null>(null)

  #update: Update | null = null

  #run = async (task: () => Promise<void>, fallback: Phase) => {
    this.failure = null

    try {
      await task()
    } catch (e) {
      this.failure = errorText(e)
      this.phase = fallback
    }
  }

  check = () =>
    this.#run(async () => {
      this.phase = "checking"
      this.#update = await check()
      this.version = this.#update?.version ?? null
      this.phase = this.#update ? "found" : "latest"
    }, "idle")

  download = () =>
    this.#run(async () => {
      const update = this.#update

      if (!update) {
        return
      }

      let total = 0
      let received = 0

      this.phase = "downloading"
      this.percent = 0

      await update.download(e => {
        if (e.event === "Started") {
          total = e.data.contentLength ?? 0
        } else if (e.event === "Progress") {
          received += e.data.chunkLength
          this.percent = total
            ? Math.min(100, Math.round((received / total) * 100))
            : 0
        }
      })

      this.phase = "ready"
    }, "found")

  restart = () =>
    this.#run(async () => {
      this.phase = "installing"
      await this.#update?.install()
      await relaunch()
    }, "ready")
}

export const updater = new Updater()
