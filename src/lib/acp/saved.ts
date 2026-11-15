import { z } from "zod"
import { persisted } from "#lib/store/stored.svelte.ts"

const OPTIONS = "harness-options"

const SESSIONS = "kept-sessions"

const DISABLED = "disabled-harnesses"

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
  localStorage.setItem(
    OPTIONS,
    JSON.stringify(withOption(remembered(), harness, cwd, configId, value)),
  )

export const disabledHarnesses = () =>
  new Set(persisted(DISABLED, [], z.array(z.string())))

export const saveDisabled = (ids: Set<string>) =>
  localStorage.setItem(DISABLED, JSON.stringify([...ids]))

export const kept = () => persisted(SESSIONS, [], z.array(keptSchema))

export const isNamed = (sessionId: string) =>
  kept().some(k => k.sessionId === sessionId && k.named)

const saveKept = (all: Kept[]) =>
  localStorage.setItem(SESSIONS, JSON.stringify(all))

export const keep = (session: Kept) => {
  const all = kept()
  const known = all.find(k => k.sessionId === session.sessionId)

  saveKept([
    ...all.filter(k => k.sessionId !== session.sessionId),
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

export const forget = (sessionId: string) =>
  saveKept(kept().filter(k => k.sessionId !== sessionId))
