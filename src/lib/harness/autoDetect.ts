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

export const autoDetect = () => {
  detectAll()

  const visible = () => {
    if (document.visibilityState === "visible") {
      detectAll()
    }
  }

  window.addEventListener("focus", detectAll)
  document.addEventListener("visibilitychange", visible)

  return () => {
    window.removeEventListener("focus", detectAll)
    document.removeEventListener("visibilitychange", visible)
  }
}
