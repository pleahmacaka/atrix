import { z } from "zod"
import { logFailure } from "#lib/logging.ts"
import { persist, persisted } from "#lib/store/stored.svelte.ts"
import { TAGS, type Tag, tagged } from "./tags.ts"

const PRIMED = "primed:"

const LEGACY = "primer:"

const primers = {
  get: (id: string) => persisted(PRIMED + id, "", z.string()),
  set: (id: string, value: string) => persist(PRIMED + id, value, ""),
}

const migrate = () => {
  try {
    const old = Object.keys(localStorage).filter(k => k.startsWith(LEGACY))

    for (const key of old) {
      const body = z
        .string()
        .safeParse(JSON.parse(localStorage.getItem(key) ?? '""'))

      if (body.success && body.data) {
        primers.set(key.slice(LEGACY.length), tagged(TAGS.agent, body.data))
      }

      localStorage.removeItem(key)
    }
  } catch (e) {
    logFailure("primer migrate", e)
  }
}

migrate()

const store = (sessionId: string, value: string) => {
  try {
    primers.set(sessionId, value)
  } catch (e) {
    logFailure("primer store", e)
  }
}

export const forgetPrimer = (sessionId: string) => store(sessionId, "")

export const prime = (sessionId: string, tag: Tag, body: string) =>
  store(sessionId, body ? tagged(tag, body) : "")

export const sendPrimed = async (
  sessionId: string,
  text: string,
  send: (text: string) => Promise<unknown>,
) => {
  const primer = primers.get(sessionId)

  if (!primer) {
    return send(text)
  }

  store(sessionId, "")

  try {
    return await send(`${primer}\n\n${text}`)
  } catch (e) {
    store(sessionId, primer)
    throw e
  }
}
