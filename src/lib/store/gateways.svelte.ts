import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { isTauri } from "@tauri-apps/api/core"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { z } from "zod"
import { logFailure } from "#lib/logging.ts"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import {
  findGateway,
  OPENROUTER_ID,
  OPENROUTER_MODEL,
  OPENROUTER_URL,
  templateOf,
} from "./gatewayCatalog.ts"
import { type Gateway, local } from "./local.svelte.ts"

const HOST_ICONS: [string, string][] = [
  ["openrouter.ai", "simple-icons:openrouter"],
  ["openai.com", "simple-icons:openai"],
  ["mistral.ai", "simple-icons:mistralai"],
  ["googleapis.com", "simple-icons:googlegemini"],
  ["deepseek.com", "simple-icons:deepseek"],
  ["anthropic.com", "simple-icons:anthropic"],
  ["x.ai", "simple-icons:x"],
  ["perplexity.ai", "simple-icons:perplexity"],
  [":11434", "simple-icons:ollama"],
  [":1234", "simple-icons:lmstudio"],
]

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export const gatewayIcon = (gateway: Pick<Gateway, "baseURL">) => {
  const host = hostOf(gateway.baseURL)

  return (
    templateOf(gateway.baseURL)?.icon ??
    HOST_ICONS.find(
      ([needle]) => host.endsWith(needle) || host.includes(needle),
    )?.[1] ??
    "lucide:server"
  )
}

const MODEL_ICONS: [string, string][] = [
  ["claude", "simple-icons:claude"],
  ["gpt", "simple-icons:openai"],
  ["o1", "simple-icons:openai"],
  ["o3", "simple-icons:openai"],
  ["o4", "simple-icons:openai"],
  ["gemini", "simple-icons:googlegemini"],
  ["gemma", "simple-icons:googlegemini"],
  ["mistral", "simple-icons:mistralai"],
  ["codestral", "simple-icons:mistralai"],
  ["magistral", "simple-icons:mistralai"],
  ["devstral", "simple-icons:mistralai"],
  ["ministral", "simple-icons:mistralai"],
  ["pixtral", "simple-icons:mistralai"],
  ["leanstral", "simple-icons:mistralai"],
  ["deepseek", "simple-icons:deepseek"],
  ["llama", "simple-icons:meta"],
  ["grok", "simple-icons:x"],
  ["sonar", "simple-icons:perplexity"],
]

export const modelIcon = (id: string) => {
  const name = id.toLowerCase().split("/").at(-1) ?? ""
  const vendor = id.toLowerCase().split("/")[0]

  return (
    MODEL_ICONS.find(
      ([prefix]) => name.includes(prefix) || vendor.includes(prefix),
    )?.[1] ?? "lucide:box"
  )
}

export const gatewayFetch: typeof fetch = isTauri() ? tauriFetch : fetch

const modelList = z.object({ data: z.array(z.object({ id: z.string() })) })

export const probeGateway = async (baseURL: string, key: string | null) => {
  let response: Response

  try {
    response = await gatewayFetch(`${baseURL}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    })
  } catch {
    throw new Error(m.gateway_probe_failed())
  }

  if (!response.ok) {
    throw new Error(m.gateway_probe_status({ status: response.status }))
  }

  const parsed = modelList.safeParse(await response.json().catch(() => null))

  if (!parsed.success) {
    throw new Error(m.gateway_probe_shape())
  }

  return parsed.data.data.map(m => m.id).toSorted()
}

const reaches = (before: Gateway | undefined, after: Gateway) =>
  !before ||
  before.key !== after.key ||
  before.baseURL !== after.baseURL ||
  !!before.removed !== !!after.removed

const store = async (gateway: Gateway) => {
  const before = local.data.gateways.find(g => g.id === gateway.id)

  local.data.gateways = [
    ...local.data.gateways.filter(g => g.id !== gateway.id),
    gateway,
  ]
  await local.save()
  sync.shareAuth()

  if (reaches(before, gateway)) {
    await sync
      .gatewayChanged(gateway.id)
      .catch(e => logFailure("gateway changed", e))
  }
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
  const reached: string[] = []
  let stale = false

  for (const theirs of incoming) {
    const mine = merged.get(theirs.id)

    if (!mine || theirs.at > mine.at) {
      merged.set(theirs.id, theirs)
      changed = true

      if (reaches(mine, theirs)) {
        reached.push(theirs.id)
      }
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

  return { changed, reached, stale }
}

export const providerFor = (gateway: Gateway) =>
  createOpenAICompatible({
    fetch: gatewayFetch,
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

  const pending = probeGateway(gateway.baseURL, gateway.key).catch(() => {
    models.delete(gateway.id)

    return []
  })

  models.set(gateway.id, pending)

  return pending
}
