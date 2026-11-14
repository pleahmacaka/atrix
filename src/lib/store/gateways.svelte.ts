import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { type Gateway, local } from "./local.svelte.ts"

export const OPENROUTER_ID = "openrouter"

export const OPENROUTER_URL = "https://openrouter.ai/api/v1"

export const OPENROUTER_MODEL = "openrouter/auto"

export const GATEWAY_ICONS = {
  openrouter: "simple-icons:openrouter",
  openai: "lucide:server",
} as const

export const activeGateways = () => local.data.gateways.filter(g => !g.removed)

export const findGateway = (id: string) =>
  activeGateways().find(g => g.id === id)

const store = async (gateway: Gateway) => {
  local.data.gateways = [
    ...local.data.gateways.filter(g => g.id !== gateway.id),
    gateway,
  ]
  await local.save()
  sync.shareAuth()
}

export const saveGateway = (gateway: Omit<Gateway, "at" | "removed">) =>
  store({ ...gateway, at: Date.now() })

export const removeGateway = async (id: string) => {
  const found = local.data.gateways.find(g => g.id === id)

  if (found) {
    await store({ ...found, key: null, removed: true, at: Date.now() })
  }
}

export const connectOpenRouter = (key: string) =>
  saveGateway({
    id: OPENROUTER_ID,
    name: "OpenRouter",
    kind: "openrouter",
    baseURL: OPENROUTER_URL,
    key,
    model: findGateway(OPENROUTER_ID)?.model ?? OPENROUTER_MODEL,
  })

export const mergeGateways = (incoming: Gateway[]) => {
  const merged = new Map(local.data.gateways.map(g => [g.id, g]))
  let changed = false
  let stale = false

  for (const theirs of incoming) {
    const mine = merged.get(theirs.id)

    if (!mine || theirs.at > mine.at) {
      merged.set(theirs.id, theirs)
      changed = true
    }
  }

  for (const mine of merged.values()) {
    const theirs = incoming.find(g => g.id === mine.id)

    if (!theirs || mine.at > theirs.at) {
      stale = true
    }
  }

  if (changed) {
    local.data.gateways = [...merged.values()]
  }

  return { changed, stale }
}

export const providerFor = (gateway: Gateway) =>
  createOpenAICompatible({
    name: gateway.id,
    baseURL: gateway.baseURL,
    apiKey: gateway.key ?? undefined,
    headers: gateway.kind === "openrouter" ? { "X-Title": "Atrix" } : undefined,
  })

const models = new Map<string, Promise<string[]>>()

export const modelIdsOf = (gateway: Gateway) => {
  const known = models.get(gateway.id)

  if (known) {
    return known
  }

  const pending = fetch(`${gateway.baseURL}/models`, {
    headers: gateway.key ? { Authorization: `Bearer ${gateway.key}` } : {},
  })
    .then(r => r.json())
    .then((body: { data: { id: string }[] }) => body.data.map(m => m.id))
    .catch(() => {
      models.delete(gateway.id)

      return []
    })

  models.set(gateway.id, pending)

  return pending
}
