import { untrack } from "svelte"
import { hostList } from "#lib/p2p/hosts.svelte.ts"

const QUIET_MS = 15_000

let last = 0

const detectAll = () => {
  if (Date.now() - last < QUIET_MS) {
    return
  }

  last = Date.now()

  for (const host of hostList()) {
    host.view.detect().catch(() => {})
  }
}

const detectWhenVisible = () => {
  if (document.visibilityState === "visible") {
    detectAll()
  }
}

export const autoDetect = () => {
  untrack(detectAll)

  window.addEventListener("focus", detectAll)
  document.addEventListener("visibilitychange", detectWhenVisible)

  return () => {
    window.removeEventListener("focus", detectAll)
    document.removeEventListener("visibilitychange", detectWhenVisible)
  }
}
