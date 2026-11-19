import { Channel } from "@tauri-apps/api/core"
import { native } from "#lib/native.ts"
import {
  type Available,
  type Composition,
  DEFAULT_PROVIDER,
  type HarnessInfo,
  type HarnessKind,
  type ProviderChoice,
  type ProviderSource,
} from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { findGateway } from "#lib/store/gatewayCatalog.ts"
import {
  loadProfiles,
  type Profile,
  profileDir,
  profileHome,
  saveProfiles,
} from "./config.ts"
import {
  installHarness,
  listHarnesses,
  type Spec,
  uninstallHarness,
} from "./harnesses.ts"
import { type Provider, providerFor } from "./provider.ts"
import {
  agentCompositions,
  type Composed,
  disabledHarnesses,
  providerChoices,
  saveAgentComposition,
  saveDisabled,
  saveProvider,
} from "./saved.ts"

export type Entry = Omit<
  HarnessInfo,
  "enabled" | "provider" | "providerSource" | "providerModel"
>

export type RegistryEvents = {
  changed: () => void
  release: (id: string) => Promise<void>
  log: (harness: string, line: string) => void
}

const PROFILE = "profile:"

const AGENT = "agent:"

const profileId = (profile: Profile) => `${PROFILE}${profile.id}`

export const agentHarness = (agent: string) => `${AGENT}${agent}`

type Provided = { provider: Provider; model: string }

export const mirrorKind = (entry: Entry | undefined): HarnessKind | null =>
  entry && !entry.profile ? entry.kind : null

const entryOf = (listed: Available): Entry => ({
  id: listed.id,
  name: listed.name,
  base: listed.id,
  kind: listed.transcript,
  vendor: listed.vendor,
  profile: null,
  local: listed.local,
  login: listed.login,
})

const specItems = (composition: Composition) => ({
  skills: composition.skills.map(s =>
    s.source === "atrix"
      ? { source: s.source, name: s.name, content: s.content }
      : { source: s.source, dir: s.dir },
  ),
  tools: composition.tools.map(t =>
    t.source === "atrix"
      ? { source: t.source, server: t.server }
      : { source: t.source, path: t.path, name: t.name },
  ),
})

export class Harnesses {
  #home = ""

  #listing: Available[] = []

  #profiles: Profile[] = []

  #entries: Entry[] = []

  #disabled = disabledHarnesses()

  #providers = providerChoices()

  #agents = agentCompositions()

  constructor(private readonly on: RegistryEvents) {}

  start = async (home: string) => {
    this.#home = home
    this.#profiles = await loadProfiles(home).catch(() => [])
    await this.#list(false).catch(() => {})
    this.#build()
    this.#refresh(true).catch(() => {})
  }

  all = (): readonly Entry[] => this.#entries

  find = (id: string): Entry | undefined =>
    this.#entries.find(h => h.id === id) ?? this.#extra(id)

  entry = (id: string) => {
    const entry = this.find(id)

    if (!entry) {
      throw new Error(m.error_harness_not_found())
    }

    return entry
  }

  disabled = (id: string) => this.#disabled.has(id)

  infos = (): HarnessInfo[] =>
    this.#entries.map(h => ({
      ...h,
      enabled: !this.#disabled.has(h.id),
      provider: this.#providers[h.id] ?? null,
      providerSource: this.#sourceOf(h.id),
      providerModel: this.#provided(h.id)?.model ?? null,
    }))

  installable = (): Available[] => this.#listing

  redetect = (force = false) => this.#refresh(force)

  install = async (id: string) => {
    await installHarness(id, this.#log(id))
    await this.#refresh(false)

    return null
  }

  uninstall = async (id: string) => {
    const { local, profile } = this.entry(id)

    if (!local || profile) {
      throw new Error(m.error_harness_not_local())
    }

    await this.on.release(id)
    await uninstallHarness(id, this.#log(id))
    this.#providers = saveProvider(id, null)
    await this.#refresh(false)

    return null
  }

  compose = (agent: string, name: string, composition: Composition) => {
    const next: Composed = { name, composition }
    const same =
      JSON.stringify(this.#agents[agent] ?? null) === JSON.stringify(next)

    if (!same) {
      this.#agents = saveAgentComposition(agent, next)
    }

    return !same
  }

  spec = (id: string): Spec => {
    const agent = this.#agentOf(id)

    if (agent) {
      const { composition } = agent
      const provided = this.#agentProvided(agent)

      return {
        harness: composition.harness,
        home: `homes/${id.replace(":", "-")}`,
        carry: true,
        native: false,
        cwd: composition.cwd,
        provider: provided?.provider ?? null,
        model: provided?.model ?? composition.model,
        instructions: composition.instructions,
        ...specItems(composition),
      }
    }

    const entry = this.entry(id)
    const provided = this.#provided(id)
    const profile = entry.profile ? id.slice(PROFILE.length) : null

    return {
      harness: entry.base,
      home: profile ? profileHome(profile) : `homes/${entry.base}`,
      carry: !profile,
      native: !profile,
      cwd: null,
      provider: provided?.provider ?? null,
      model: provided?.model ?? null,
      instructions: null,
      skills: [],
      tools: [],
    }
  }

  providedModel = (id: string) => {
    const agent = this.#agentOf(id)

    return (agent ? this.#agentProvided(agent) : this.#provided(id))?.model
  }

  affectedBy = (changed: string) => {
    const direct =
      changed === DEFAULT_PROVIDER
        ? this.#entries
            .filter(h => this.#sourceOf(h.id) === "default")
            .map(h => h.id)
        : [changed]
    const inheriting = Object.entries(this.#agents)
      .filter(
        ([, a]) =>
          !a.composition.provider &&
          (changed === DEFAULT_PROVIDER || a.composition.harness === changed),
      )
      .map(([id]) => agentHarness(id))

    return [...direct, ...inheriting]
  }

  usingGateway = (gateway: string) => {
    const uses = (picked: ProviderChoice | null | undefined) =>
      picked?.source === "gateway" && picked.gateway === gateway

    return [
      ...Object.entries(this.#providers)
        .filter(([, picked]) => uses(picked))
        .flatMap(([id]) => this.affectedBy(id)),
      ...Object.entries(this.#agents)
        .filter(([, a]) => uses(a.composition.provider))
        .map(([id]) => agentHarness(id)),
    ]
  }

  defaultProvider = () => this.#providers[DEFAULT_PROVIDER] ?? null

  setProvider = (id: string, picked: ProviderChoice | null) => {
    if (picked && !this.#valid(id, picked)) {
      throw new Error(m.error_provider_invalid())
    }

    if (
      JSON.stringify(this.#providers[id] ?? null) === JSON.stringify(picked)
    ) {
      return false
    }

    this.#providers = saveProvider(id, picked)
    this.on.changed()

    return true
  }

  toggle = async (id: string, enabled: boolean) => {
    this.entry(id)

    if (enabled) {
      this.#disabled.delete(id)
    } else {
      this.#disabled.add(id)
      await this.on.release(id)
    }

    saveDisabled(this.#disabled)
    this.on.changed()

    return null
  }

  removeProfile = async (harness: string) => {
    const { profile } = this.entry(harness)

    if (!profile) {
      throw new Error(m.error_global_delete())
    }

    await this.on.release(harness)
    await native("remove_path", {
      path: await profileDir(this.#home, harness.slice(PROFILE.length)),
    })
    this.#profiles = this.#profiles.filter(p => profileId(p) !== harness)
    await saveProfiles(this.#home, this.#profiles)
    this.#providers = saveProvider(harness, null)
    await this.#refresh(false)

    return null
  }

  #agentOf = (id: string) =>
    id.startsWith(AGENT) ? this.#agents[id.slice(AGENT.length)] : undefined

  #extra = (id: string): Entry | undefined => {
    const agent = this.#agentOf(id)

    if (agent) {
      const base = this.#listing.find(l => l.id === agent.composition.harness)

      return {
        id,
        name: agent.name,
        base: agent.composition.harness,
        kind: null,
        vendor: base?.vendor ?? null,
        profile: null,
        local: false,
        login: null,
      }
    }

    const listed = this.#listing.find(l => l.id === id && l.state !== "missing")

    return listed && entryOf(listed)
  }

  #resolve = (
    base: string,
    picked: ProviderChoice | null | undefined,
  ): Provided | null => {
    if (picked?.source !== "gateway" || !picked.model) {
      return null
    }

    const gateway = findGateway(picked.gateway)
    const wires = this.#listing.find(l => l.id === base)?.wires ?? []
    const provider = gateway && providerFor(gateway, wires)

    return provider ? { provider, model: picked.model } : null
  }

  #sourceOf = (id: string): ProviderSource => {
    const own = this.#providers[id]

    if (!own) {
      return "default"
    }

    return own.source === "native" ? "native" : "own"
  }

  #provided = (id: string) => {
    const base = this.find(id)?.base ?? id

    switch (this.#sourceOf(id)) {
      case "native":
        return null
      case "own":
        return this.#resolve(base, this.#providers[id])
      case "default":
        return this.#resolve(base, this.#providers[DEFAULT_PROVIDER])
    }
  }

  #agentProvided = ({ composition }: Composed) =>
    composition.provider
      ? this.#resolve(composition.harness, composition.provider)
      : this.#provided(composition.harness)

  #valid = (id: string, picked: ProviderChoice) => {
    if (id === DEFAULT_PROVIDER) {
      return (
        picked.source === "gateway" &&
        !!findGateway(picked.gateway) &&
        !!picked.model.trim()
      )
    }

    return (
      picked.source === "native" || !!this.#resolve(this.entry(id).base, picked)
    )
  }

  #log = (harness: string) =>
    new Channel<string>(line => this.on.log(harness, line))

  #list = async (refresh: boolean) => {
    this.#listing = await listHarnesses(refresh)
  }

  #refresh = async (force: boolean) => {
    await this.#list(force)
    this.#build()
    this.on.changed()
  }

  #build = () => {
    const base = this.#listing.filter(l => l.state === "installed").map(entryOf)
    const profiles = this.#profiles.flatMap(p => {
      const listed = this.#listing.find(
        l => l.id === p.base && l.state !== "missing",
      )
      const parent = listed && entryOf(listed)

      return parent
        ? [
            {
              ...parent,
              id: profileId(p),
              name: `${parent.name} (${p.name})`,
              profile: p.name,
              local: false,
              login: null,
            },
          ]
        : []
    })

    this.#entries = [...base, ...profiles]
  }
}
