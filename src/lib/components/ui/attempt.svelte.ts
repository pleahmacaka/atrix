import { isBusyError, isGoneError } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

export const errorText = (e: unknown) => {
  if (isBusyError(e)) {
    return m.chat_session_busy()
  }

  if (isGoneError(e)) {
    return m.chat_session_gone()
  }

  return e instanceof Error ? e.message : String(e)
}

export class Attempt {
  busy = $state(false)

  failure = $state<string | null>(null)

  run = async (work: () => Promise<unknown>) => {
    this.busy = true
    this.failure = null

    try {
      await work()

      return true
    } catch (e) {
      this.failure = errorText(e)

      return false
    } finally {
      this.busy = false
    }
  }
}
