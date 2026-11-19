import {
  blockNamed,
  dependenciesOf,
  expand,
  kindOf,
  PART_NAME,
  resolve,
} from "#lib/agents/compose.ts"
import { chats } from "#lib/chat/chats.svelte.ts"
import { matchChoice } from "#lib/chat/choices.ts"
import { prime } from "#lib/chat/primer.ts"
import { TAGS } from "#lib/chat/tags.ts"
import { brandIcon } from "#lib/components/harness/brands.ts"
import { hostById, hostList } from "#lib/p2p/hosts.svelte.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type {
  Composition,
  Presence,
  ProviderChoice,
} from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { activeGateways } from "#lib/store/gatewayCatalog.ts"
import { gatewayIcon } from "#lib/store/gateways.svelte.ts"
import {
  local,
  type PartKind,
  type StoredAgent,
  type StoredPrompt,
} from "#lib/store/local.svelte.ts"
import { settings } from "#lib/store/settings.svelte.ts"

export type Provider =
  | {
      key: string
      kind: "harness"
      label: string
      detail: string
      icon: string
      host: string
      harness: string
      base: string
      state: Presence
    }
  | {
      key: string
      kind: "gateway"
      label: string
      detail: string
      icon: string
      gateway: string
      model: string
    }

const harnessProviders = (): Provider[] =>
  hostList().flatMap(host =>
    (host.view.state?.available ?? [])
      .filter(a => a.state !== "missing")
      .map(a => ({
        key: `harness:${host.id}:${a.id}`,
        kind: "harness",
        label: a.name,
        detail: host.name,
        icon: brandIcon(a.id),
        host: host.id,
        harness: a.id,
        base: a.id,
        state: a.state,
      })),
  )

const gatewayProviders = (): Provider[] =>
  activeGateways().map(g => ({
    key: `gateway:${g.id}`,
    kind: "gateway",
    label: g.name,
    detail: m.target_api(),
    icon: gatewayIcon(g),
    gateway: g.id,
    model: g.model,
  }))

export const providers = (): Provider[] => [
  ...harnessProviders(),
  ...gatewayProviders(),
]

const legacyProvider = (list: Provider[], key: string) => {
  const [kind, host, ...rest] = key.split(":")
  const id = rest.join(":")
  const base =
    kind === "harness" &&
    hostById(host)?.state?.harnesses.find(h => h.id === id)?.base

  return base ? list.find(p => p.key === `harness:${host}:${base}`) : undefined
}

export const providerOf = (agent: Pick<StoredAgent, "provider">) => {
  const list = providers()

  return (
    list.find(p => p.key === agent.provider) ??
    legacyProvider(list, agent.provider)
  )
}

export const NATIVE = "native"

export type Template = {
  id: string
  name: () => string
  icon: string
  prefer: "harness" | "gateway"
  model: string
  effort: string
  instructions: string
  variables: () => Record<string, string>
}

const DEVELOPER = `You are {{agent_name}}, a software engineer working in {{cwd}}.

- Read the code and confirm the cause before you change anything.
- After a change, run the build, lint and tests, and report the results.
- Back every claim with evidence: the command you ran, its output, and file paths.
- Never push, delete or deploy without the user's approval.
- Reply to the user in {{reply_language}}.`

const VOICE = `You are {{agent_name}}, a voice conversation partner. Today is {{date}}.

- Speak in {{spoken_language}}. Keep every answer to two or three short sentences that sound natural read aloud.
- Never use markdown, lists, code or emoji.
- Help with everyday conversation, speaking practice and language learning.
- When the user makes a mistake in {{spoken_language}}, give the natural phrasing once, briefly, then keep the conversation going.`

const localeLanguage = () => (getLocale() === "ko" ? "Korean" : "English")

export const TEMPLATES: Template[] = [
  {
    id: "developer",
    name: m.agent_template_dev,
    icon: "lucide:code-xml",
    prefer: "harness",
    model: "opus",
    effort: "high",
    instructions: DEVELOPER,
    variables: () => ({ reply_language: localeLanguage() }),
  },
  {
    id: "voice",
    name: m.agent_template_voice,
    icon: "lucide:audio-lines",
    prefer: "gateway",
    model: "",
    effort: "low",
    instructions: VOICE,
    variables: () => ({ spoken_language: localeLanguage() }),
  },
]

const matches = (provider: Provider, prefer: Template["prefer"]) =>
  provider.kind === prefer &&
  (provider.kind !== "harness" || provider.state === "installed")

export const fromTemplate = (
  template: Template,
): Omit<StoredAgent, "id" | "at"> => {
  const list = providers()
  const provider =
    list.find(p => matches(p, template.prefer)) ??
    list.find(p => p.kind === "gateway" || p.state === "installed")

  return {
    name: template.name(),
    provider: provider?.key ?? "",
    model: provider?.kind === "gateway" ? provider.model : template.model,
    effort: template.effort,
    instructions: template.instructions,
    variables: template.variables(),
    requires: {},
    skills: [],
    tools: [],
    cwd: "",
  }
}

class Agents {
  get list() {
    return local.data.agents.toSorted((a, b) => b.at - a.at)
  }

  find = (id: string) => local.data.agents.find(a => a.id === id)

  save = async (
    agent: Omit<StoredAgent, "at" | "id"> & { id: string | null },
  ) => {
    const id = agent.id ?? crypto.randomUUID()

    local.data.agents = [
      ...local.data.agents.filter(a => a.id !== id),
      { ...agent, id, at: Date.now() },
    ]
    await local.save()

    return id
  }

  remove = async (id: string) => {
    local.data.agents = local.data.agents.filter(a => a.id !== id)
    await local.save()
  }
}

export const agents = new Agents()

export const agentHost = (id: string) => {
  const agent = agents.find(id)
  const provider = agent ? providerOf(agent) : undefined

  return provider?.kind === "harness" ? provider.host : null
}

export const PROMPT_NAME = PART_NAME

class Prompts {
  get list() {
    return local.data.prompts.toSorted((a, b) => a.name.localeCompare(b.name))
  }

  of = (kind: PartKind) => this.list.filter(p => kindOf(p) === kind)

  find = (id: string) => local.data.prompts.find(p => p.id === id)

  named = (name: string) => blockNamed(local.data.prompts, name)

  save = async (
    prompt: Omit<StoredPrompt, "at" | "id"> & { id: string | null },
  ) => {
    const id = prompt.id ?? crypto.randomUUID()

    local.data.prompts = [
      ...local.data.prompts.filter(p => p.id !== id),
      { ...prompt, id, at: Date.now() },
    ]
    await local.save()

    return id
  }

  remove = async (id: string) => {
    local.data.prompts = local.data.prompts.filter(p => p.id !== id)
    await local.save()
  }

  expand = (text: string) => expand(local.data.prompts, text)
}

export const prompts = new Prompts()

const configure = async (view: HostView, id: string, agent: StoredAgent) => {
  const config = view.views[id]?.config ?? []
  const option = config.find(o => o.category === "thought_level")
  const value =
    option && agent.effort
      ? matchChoice(option.values, agent.effort)
      : undefined

  if (option && value && value !== option.current) {
    await view.configure(id, option.id, value)
  }
}

export type Opened =
  | { kind: "session"; host: string; id: string }
  | { kind: "chat"; id: string }

export const agentInstructions = (agent: StoredAgent, cwd: string) =>
  resolve(local.data.prompts, agent.instructions, {
    date: new Date().toLocaleDateString(getLocale()),
    time: new Date().toLocaleTimeString(getLocale()),
    agent_name: agent.name,
    cwd,
    ...(settings.userName && { user: settings.userName }),
    ...agent.variables,
  })

export const dependencies = (
  agent: Pick<StoredAgent, "instructions" | "requires">,
) => dependenciesOf(local.data.prompts, agent)

const providerChoiceOf = (agent: StoredAgent): ProviderChoice | null => {
  if (agent.gateway === NATIVE) {
    return { source: "native" }
  }

  return agent.gateway
    ? { source: "gateway", gateway: agent.gateway, model: agent.model }
    : null
}

export const compositionOf = (
  agent: StoredAgent,
  harness: string,
  cwd: string,
): Composition => ({
  harness,
  provider: providerChoiceOf(agent),
  model: agent.model || null,
  skills: agent.skills ?? [],
  tools: agent.tools ?? [],
  instructions: agentInstructions(agent, cwd) || null,
  cwd: cwd || null,
})

const openChat = async (
  agent: StoredAgent,
  provider: Extract<Provider, { kind: "gateway" }>,
) => {
  const id = chats.create(provider.gateway, agent.model || provider.model)
  const stored = chats.find(id)

  if (stored) {
    stored.instructions = agentInstructions(agent, "")
    stored.title = agent.name
    await local.save()
  }

  return { kind: "chat", id } as const
}

const composeOn = async (
  view: HostView,
  agent: StoredAgent,
  harness: string,
  folder: string,
) => view.compose(agent.id, agent.name, compositionOf(agent, harness, folder))

export const warmAgent = async (agent: StoredAgent) => {
  const provider = providerOf(agent)
  const view =
    provider?.kind === "harness" ? hostById(provider.host) : undefined

  if (provider?.kind === "harness" && view) {
    const folder = agent.cwd || view.state?.home || ""

    await view.warm(await composeOn(view, agent, provider.harness, folder))
  }
}

const openSession = async (
  agent: StoredAgent,
  provider: Extract<Provider, { kind: "harness" }>,
  cwd: string,
  primed: boolean,
) => {
  const view = hostById(provider.host)

  if (!view) {
    throw new Error(m.chat_no_device())
  }

  const folder = cwd || view.state?.home || ""
  const harness = await composeOn(view, agent, provider.harness, folder)
  const id = await view.create(harness, folder)

  try {
    await configure(view, id, agent)
  } catch (e) {
    await view.close(id)
    throw e
  }

  const skipped = view.views[id]?.skipped ?? []

  if (primed && skipped.some(s => s.item === "instructions")) {
    prime(id, TAGS.agent, agentInstructions(agent, folder))
  }

  return { kind: "session", host: provider.host, id } as const
}

export const openAgent = async (
  agent: StoredAgent,
  cwd = agent.cwd,
  { primed = true } = {},
): Promise<Opened> => {
  const provider = providerOf(agent)

  if (!provider) {
    throw new Error(m.agent_provider_missing())
  }

  return provider.kind === "gateway"
    ? openChat(agent, provider)
    : openSession(agent, provider, cwd, primed)
}
