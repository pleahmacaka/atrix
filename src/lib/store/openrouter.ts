import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { randomBytes, toBase64Url } from "./crypto.ts"

const AUTH = "https://openrouter.ai/auth"

const EXCHANGE = "https://openrouter.ai/api/v1/auth/keys"

const PENDING = "openrouter-pending"

const LABEL = "Atrix"

type Pending = { verifier: string; code?: string }

const challengeOf = async (verifier: string) =>
  toBase64Url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  )

const authUrl = async (callback: string, verifier: string) => {
  const url = new URL(AUTH)

  url.searchParams.set("callback_url", callback)
  url.searchParams.set("code_challenge", await challengeOf(verifier))
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("key_label", LABEL)

  return url.href
}

const exchange = async (code: string, verifier: string) => {
  const response = await fetch(EXCHANGE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: "S256",
    }),
  })

  if (!response.ok) {
    throw new Error(m.openrouter_failed({ status: response.status }))
  }

  const { key } = (await response.json()) as { key: string }

  return key
}

const desktopLogin = async (verifier: string) => {
  const { start, cancel, onUrl } = await import(
    "@fabianlars/tauri-plugin-oauth"
  )
  const { openUrl } = await import("@tauri-apps/plugin-opener")
  const port = await start()
  const code = Promise.withResolvers<string>()
  const unlisten = await onUrl(url => {
    const found = new URL(url).searchParams.get("code")

    if (found) {
      code.resolve(found)
    } else {
      code.reject(new Error(m.openrouter_cancelled()))
    }
  })

  try {
    await openUrl(await authUrl(`http://localhost:${port}/`, verifier))

    return await exchange(await code.promise, verifier)
  } finally {
    unlisten()
    await cancel(port)
  }
}

export const login = async () => {
  const verifier = toBase64Url(randomBytes(32))

  if (desktop) {
    return desktopLogin(verifier)
  }

  sessionStorage.setItem(PENDING, JSON.stringify({ verifier }))
  location.assign(await authUrl(location.origin + location.pathname, verifier))

  return null
}

export const captureCallback = () => {
  const url = new URL(location.href)
  const code = url.searchParams.get("code")
  const pending = sessionStorage.getItem(PENDING)

  if (!code || !pending) {
    return
  }

  sessionStorage.setItem(
    PENDING,
    JSON.stringify({ ...JSON.parse(pending), code }),
  )
  url.searchParams.delete("code")
  history.replaceState(null, "", url)
}

export const finishCallback = async () => {
  const raw = sessionStorage.getItem(PENDING)
  const pending = raw ? (JSON.parse(raw) as Pending) : null

  if (!pending?.code) {
    return null
  }

  sessionStorage.removeItem(PENDING)

  return exchange(pending.code, pending.verifier)
}
