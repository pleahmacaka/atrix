import { z } from "zod"
import { type ProviderChoice, providerChoice } from "#lib/p2p/protocol.ts"
import { persist, persisted } from "#lib/store/stored.svelte.ts"

const OPTIONS = "harness-options"

const SESSIONS = "kept-sessions"

const DISABLED = "disabled-harnesses"

const PROVIDERS = "harness-providers"

const CLOSED = "closed-sessions"

const CLOSED_LIMIT = 500

const optionsSchema = z.record(z.string(), z.record(z.string(), z.string()))

const keptSchema = z.object({
  harness: z.string(),
  sessionId: z.string(),
  cwd: z.string(),
  title: z.string(),
  named: z.boolean().optional(),
})

export type Options = z.infer<typeof optionsSchema>

export type Kept = z.infer<typeof keptSchema>

const placeOf = (harness: string, cwd: string) => `${harness}|${cwd}`

export const optionsFor = (all: Options, harness: string, cwd: string) => ({
  ...all[harness],
  ...all[placeOf(harness, cwd)],
})

const withOption = (
  all: Options,
  harness: string,
  cwd: string,
  configId: string,
  value: string,
): Options => {
  const place = placeOf(harness, cwd)

  return {
    ...all,
    [harness]: { ...all[harness], [configId]: value },
    [place]: { ...all[place], [configId]: value },
  }
}

export const remembered = () => persisted(OPTIONS, {}, optionsSchema)

export const remember = (
  harness: string,
  cwd: string,
  configId: string,
  value: string,
) =>
  persist(OPTIONS, withOption(remembered(), harness, cwd, configId, value), {})

export const disabledHarnesses = () =>
  new Set(persisted(DISABLED, [], z.array(z.string())))

export const saveDisabled = (ids: Set<string>) =>
  persist(DISABLED, [...ids], [])

export const kept = () => persisted(SESSIONS, [], z.array(keptSchema))

export const isNamed = (sessionId: string) =>
  kept().some(k => k.sessionId === sessionId && k.named)

const saveKept = (all: Kept[]) => persist(SESSIONS, all, [])

const keptOf = (sessionId: string) =>
  kept().find(k => k.sessionId === sessionId)

const without = (sessionId: string) =>
  kept().filter(k => k.sessionId !== sessionId)

const closedIds = () => persisted(CLOSED, [], z.array(z.string()))

const saveClosed = (ids: string[]) =>
  persist(CLOSED, ids.slice(-CLOSED_LIMIT), [])

export const isClosed = (sessionId: string) => closedIds().includes(sessionId)

export const keep = (session: Kept) => {
  const known = keptOf(session.sessionId)

  if (isClosed(session.sessionId)) {
    saveClosed(closedIds().filter(id => id !== session.sessionId))
  }

  saveKept([
    ...without(session.sessionId),
    { ...known, ...session, ...(known?.named && { title: known.title }) },
  ])
}

export const rename = (sessionId: string, title: string) => {
  const all = kept()
  const known = all.find(k => k.sessionId === sessionId)

  if (known && !known.named && known.title !== title) {
    known.title = title
    saveKept(all)
  }
}

export const forget = (sessionId: string) => saveKept(without(sessionId))

export const bury = (sessionId: string) => {
  forget(sessionId)
  saveClosed([...closedIds().filter(id => id !== sessionId), sessionId])
}

const legacyChoice = z
  .object({ gateway: z.string(), model: z.string() })
  .transform(
    ({ gateway, model }): ProviderChoice =>
      gateway === "native"
        ? { source: "native" }
        : { source: "gateway", gateway, model },
  )

const providersSchema = z.record(
  z.string(),
  z.union([providerChoice, legacyChoice]),
)

export const providerChoices = () => persisted(PROVIDERS, {}, providersSchema)

export const saveProvider = (
  harness: string,
  picked: ProviderChoice | null,
) => {
  const { [harness]: _old, ...rest } = providerChoices()
  const next = picked ? { ...rest, [harness]: picked } : rest

  persist(PROVIDERS, next, {})

  return next
}
