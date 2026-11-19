import type { LockKind, LockSecret } from "#lib/p2p/protocol.ts"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { local } from "#lib/store/local.svelte.ts"
import { settings } from "#lib/store/settings.svelte.ts"

const LOCKED = "screen-locked"

const ACTIVE = "screen-active"

const TOUCH_MS = 5_000

const CHECK_MS = 15_000

const FREE_TRIES = 5

const COOLDOWN_MS = 30_000

const digest = async (salt: string, secret: string) => {
  const bytes = new TextEncoder().encode(`${salt}:${secret}`)
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))

  return hash.toHex()
}

const readFlag = (key: string) => {
  try {
    return localStorage.getItem(key) === "1"
  } catch {
    return false
  }
}

const writeFlag = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? "1" : "0")
  } catch {}
}

export const lockKind = (): LockKind | null => {
  const secret = local.data.lock

  return secret && secret.kind !== "none" ? secret.kind : null
}

const store = async (secret: LockSecret) => {
  local.data.lock = secret
  await local.save()
  sync.shareAuth()
}

export const setLock = async (kind: LockKind, value: string) => {
  const salt = crypto.randomUUID()

  await store({ kind, salt, hash: await digest(salt, value), at: Date.now() })
}

export const clearLock = () =>
  store({ kind: "none", salt: "", hash: "", at: Date.now() })

export const checkLock = async (value: string) => {
  const secret = local.data.lock

  return (
    !!secret &&
    secret.kind !== "none" &&
    (await digest(secret.salt, value)) === secret.hash
  )
}

export type Setup = LockKind | "remove"

class Screen {
  locked = $state(readFlag(LOCKED))

  setup = $state<Setup | null>(null)

  waiting = $state(false)

  #failures = 0

  #active = Date.now()

  constructor() {
    window.addEventListener("storage", e => {
      if (e.key === LOCKED) {
        this.locked = e.newValue === "1"
      } else if (e.key === ACTIVE) {
        this.#active = Math.max(this.#active, Number(e.newValue) || 0)
      }
    })

    const touch = () => {
      const now = Date.now()

      if (now - this.#active < TOUCH_MS) {
        return
      }

      this.#active = now

      try {
        localStorage.setItem(ACTIVE, String(now))
      } catch {}
    }

    for (const name of ["pointerdown", "pointermove", "keydown", "wheel"]) {
      window.addEventListener(name, touch, { passive: true })
    }
  }

  lock = () => {
    if (!lockKind()) {
      this.setup = "pin"

      return
    }

    this.setup = null
    this.locked = true
    writeFlag(LOCKED, true)
  }

  unlock = () => {
    this.locked = false
    this.#failures = 0
    this.#active = Date.now()
    writeFlag(LOCKED, false)
  }

  fail = () => {
    this.#failures += 1

    if (this.#failures >= FREE_TRIES) {
      this.waiting = true
      setTimeout(() => {
        this.waiting = false
        this.#failures = 0
      }, COOLDOWN_MS)
    }
  }

  watch = () => {
    const check = () => {
      const idle = settings.lockIdle * 60_000

      if (
        idle > 0 &&
        !this.locked &&
        lockKind() &&
        Date.now() - this.#active > idle
      ) {
        this.lock()
      }
    }

    const timer = setInterval(check, CHECK_MS)

    document.addEventListener("visibilitychange", check)

    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", check)
    }
  }
}

export const screen = new Screen()
