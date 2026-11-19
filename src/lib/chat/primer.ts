import { z } from "zod"
import { logFailure } from "#lib/logging.ts"
import { Stored } from "#lib/store/stored.svelte.ts"
import { TAGS, type Tag, tagged } from "./tags.ts"

const PRIMED = "primed:"

const LEGACY = "primer:"

const primers = new Stored("", "", z.string())

const setPrimer = (id: string, value: string) => {
  try {
    primers.set(PRIMED + id, value)
  } catch (e) {
    logFailure("primer store", e)
  }
}

const migrate = () => {
  try {
    const legacy = Object.keys(localStorage).filter(k => k.startsWith(LEGACY))

    for (const key of legacy) {
      const body = z
        .string()
        .safeParse(JSON.parse(localStorage.getItem(key) ?? '""'))

      if (body.success && body.data) {
        setPrimer(key.slice(LEGACY.length), tagged(TAGS.agent, body.data))
      }

      localStorage.removeItem(key)
    }
  } catch (e) {
    logFailure("primer migrate", e)
  }
}

migrate()

export const forgetPrimer = (sessionId: string) => setPrimer(sessionId, "")

export const prime = (sessionId: string, tag: Tag, body: string) =>
  setPrimer(sessionId, body ? tagged(tag, body) : "")

export const sendPrimed = async (
  sessionId: string,
  text: string,
  send: (text: string) => Promise<unknown>,
) => {
  const primer = primers.get(PRIMED + sessionId)

  if (!primer) {
    return send(text)
  }

  setPrimer(sessionId, "")

  try {
    return await send(`${primer}\n\n${text}`)
  } catch (e) {
    setPrimer(sessionId, primer)
    throw e
  }
}
