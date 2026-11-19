import { BRIDGE_NAME } from "#lib/acp/toolNames.ts"
import {
  blockNamed,
  dependenciesOf,
  expand,
  kindOf,
  mcpNamesOf,
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
import type { Skill } from "#lib/p2p/protocol.ts"
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

export const providers = (): Provider[] => [
  ...hostList().flatMap(host =>
    (host.view.state?.harnesses ?? [])
      .filter(h => h.enabled)
      .map(h => ({
        key: `harness:${host.id}:${h.id}`,
        kind: "harness" as const,
        label: h.profile ?? h.name,
        detail: host.name,
        icon: brandIcon(h.base),
        host: host.id,
        harness: h.id,
        base: h.base,
      })),
  ),
  ...activeGateways().map(g => ({
    key: `gateway:${g.id}`,
    kind: "gateway" as const,
    label: g.name,
    detail: m.target_api(),
    icon: gatewayIcon(g),
    gateway: g.id,
    model: g.model,
  })),
]

export const providerOf = (agent: Pick<StoredAgent, "provider">) =>
  providers().find(p => p.key === agent.provider)

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

export const fromTemplate = (
  template: Template,
): Omit<StoredAgent, "id" | "at"> => {
  const list = providers()
  const provider =
    list.find(
      p =>
        p.kind === template.prefer &&
        (p.kind !== "harness" || p.base === "claude-acp"),
    ) ?? list[0]

  return {
    name: template.name(),
    provider: provider?.key ?? "",
    model: provider?.kind === "gateway" ? provider.model : template.model,
    effort: template.effort,
    instructions: template.instructions,
    variables: template.variables(),
    requires: {},
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
  const wants: [string, string][] = [
    ["model", agent.model],
    ["thought_level", agent.effort],
  ]

  for (const [category, wanted] of wants) {
    const option = config.find(o => o.category === category)
    const value =
      option && wanted ? matchChoice(option.values, wanted) : undefined

    if (option && value && value !== option.current) {
      await view.configure(id, option.id, value)
    }
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

export type Inventory = { skills: Skill[]; mcp: string[] }

export const inventoryOf = async (
  view: HostView,
  harness: string,
): Promise<Inventory> => {
  const config = await view.readHarness(harness)
  const mcp = config.docs.flatMap(doc =>
    doc.id === "mcp" || (doc.format === "toml" && doc.id === "settings")
      ? mcpNamesOf(doc)
      : [],
  )

  return { skills: config.skills, mcp: [BRIDGE_NAME, ...mcp] }
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

  if (provider.kind === "gateway") {
    const id = chats.create(provider.gateway, agent.model || provider.model)
    const stored = chats.find(id)

    if (stored) {
      stored.instructions = agentInstructions(agent, "")
      stored.title = agent.name
      await local.save()
    }

    return { kind: "chat", id }
  }

  const view = hostById(provider.host)

  if (!view) {
    throw new Error(m.chat_no_device())
  }

  const folder = cwd || view.state?.home || ""
  const id = await view.create(provider.harness, folder)

  try {
    await configure(view, id, agent)
  } catch (e) {
    await view.close(id)
    throw e
  }

  if (primed) {
    prime(id, TAGS.agent, agentInstructions(agent, folder))
  }

  return { kind: "session", host: provider.host, id }
}
