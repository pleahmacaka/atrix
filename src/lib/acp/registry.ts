import { Channel } from "@tauri-apps/api/core"
import { native } from "#lib/native.ts"
import {
  type Available,
  DEFAULT_PROVIDER,
  type HarnessInfo,
  type HarnessKind,
  type Installed,
  type InstallScope,
  type ProviderChoice,
  type ProviderSource,
} from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { findGateway } from "#lib/store/gatewayCatalog.ts"
import {
  createProfileDir,
  envFor,
  KINDS,
  loadProfiles,
  type Profile,
  profileDir,
  saveProfiles,
  type Target,
} from "./config.ts"
import {
  detectHarnesses,
  type Harness,
  type Installable,
  type Launch,
  type Source,
} from "./harnesses.ts"
import { prepareLaunch, providerKindOf, servesKind } from "./provider.ts"
import {
  disabledHarnesses,
  providerChoices,
  saveDisabled,
  saveProvider,
} from "./saved.ts"

export type Entry = Omit<
  HarnessInfo,
  "enabled" | "provider" | "providerSource" | "providerModel"
> & {
  launch: Launch
  dir: string | null
  source: Source | null
}

export type RegistryEvents = {
  changed: () => void
  release: (id: string) => Promise<unknown>
  log: (harness: string, line: string) => void
}

const PROFILE = "profile:"

const profileId = (profile: Profile) => `${PROFILE}${profile.id}`

export const mirrorKind = (entry: Entry | undefined): HarnessKind | null =>
  entry && !entry.profile ? entry.kind : null

export class Harnesses {
  #home = ""

  #base: Harness[] = []

  #available: Installable[] = []

  #profiles: Profile[] = []

  #entries: Entry[] = []

  #disabled = disabledHarnesses()

  #providers = providerChoices()

  constructor(private readonly on: RegistryEvents) {}

  start = async (home: string) => {
    this.#home = home
    await this.#detect().catch(() => {})
    this.#profiles = await loadProfiles(home).catch(() => [])
    await this.#build()
  }

  all = (): readonly Entry[] => this.#entries

  find = (id: string) => this.#entries.find(h => h.id === id)

  entry = (id: string) => {
    const entry = this.find(id)

    if (!entry) {
      throw new Error(m.error_harness_not_found())
    }

    return entry
  }

  disabled = (id: string) => this.#disabled.has(id)

  infos = (): HarnessInfo[] =>
    this.#entries.map(
      ({ launch: _launch, dir: _dir, source: _source, ...h }) => ({
        ...h,
        enabled: !this.#disabled.has(h.id),
        provider: this.#providers[h.id] ?? null,
        providerSource: this.#sourceOf(h.id),
        providerModel: this.#provided(h.id)?.model ?? null,
      }),
    )

  installable = (): Available[] =>
    this.#available.map(({ source: _source, ...a }) => a)

  target = (id: string): Target => {
    const { kind, dir } = this.entry(id)

    if (!kind) {
      throw new Error(m.error_harness_no_config())
    }

    return { kind, home: this.#home, dir }
  }

  redetect = async (force = false) => {
    await this.#detect(force)
    await this.#build()
    this.on.changed()
  }

  install = async (id: string, scope: InstallScope): Promise<Installed> => {
    const target = this.#available.find(a => a.id === id)

    if (!target) {
      throw new Error(m.error_harness_not_found())
    }

    const pathHint = await native<string | null>("tool_install", {
      source: target.source,
      scope,
      channel: this.#log(id),
    })

    await this.redetect()

    return { pathHint }
  }

  uninstall = async (id: string) => {
    const { source, local } = this.entry(id)

    if (!source || !local) {
      throw new Error(m.error_harness_not_local())
    }

    await this.on.release(id)
    await native("tool_uninstall", { source, channel: this.#log(id) })
    this.#forgetProvider(id)
    await this.redetect()

    return null
  }

  affectedBy = (changed: string) =>
    changed === DEFAULT_PROVIDER
      ? this.#entries
          .filter(h => this.#sourceOf(h.id) === "default")
          .map(h => h.id)
      : [changed]

  usingGateway = (gateway: string) =>
    Object.entries(this.#providers)
      .filter(
        ([, picked]) =>
          picked.source === "gateway" && picked.gateway === gateway,
      )
      .flatMap(([id]) => this.affectedBy(id))

  #forgetProvider = (id: string) => {
    this.#providers = saveProvider(id, null)
  }

  #resolve = (id: string, picked: ProviderChoice | undefined) => {
    if (picked?.source !== "gateway") {
      return null
    }

    const found = this.find(id)
    const kind = found ? providerKindOf(found) : null
    const gateway = findGateway(picked.gateway)

    return kind && picked.model && gateway && servesKind(kind, gateway)
      ? { kind, gateway, model: picked.model }
      : null
  }

  #sourceOf = (id: string): ProviderSource => {
    const own = this.#providers[id]

    if (!own) {
      return "default"
    }

    return own.source === "native" ? "native" : "own"
  }

  #provided = (id: string) => {
    switch (this.#sourceOf(id)) {
      case "native":
        return null
      case "own":
        return this.#resolve(id, this.#providers[id])
      case "default":
        return this.#resolve(id, this.#providers[DEFAULT_PROVIDER])
    }
  }

  defaultProvider = () => this.#providers[DEFAULT_PROVIDER] ?? null

  providedModel = (id: string) => this.#provided(id)?.model ?? null

  prepareLaunch = (id: string) => {
    const { launch } = this.entry(id)
    const provided = this.#provided(id)

    return provided
      ? prepareLaunch(
          provided.kind,
          launch,
          provided.gateway,
          provided.model,
          this.#home,
        )
      : Promise.resolve(launch)
  }

  #valid = (id: string, picked: ProviderChoice) => {
    if (id === DEFAULT_PROVIDER) {
      return (
        picked.source === "gateway" &&
        !!findGateway(picked.gateway) &&
        !!picked.model.trim()
      )
    }

    this.entry(id)

    return picked.source === "native" || !!this.#resolve(id, picked)
  }

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

  createProfile = async (harness: string, name: string, fork: boolean) => {
    const base = this.entry(harness)
    const trimmed = name.trim()

    if (!base.kind || base.profile) {
      throw new Error(m.error_harness_no_profiles())
    }

    if (!trimmed) {
      throw new Error(m.error_profile_name())
    }

    const profile = { id: crypto.randomUUID(), base: base.id, name: trimmed }

    const dir = await profileDir(this.#home, profile.id)
    const skipped = await createProfileDir(
      base.kind,
      this.#home,
      dir,
      fork,
    ).catch(async (e: unknown) => {
      await native("remove_path", { path: dir })
      throw e
    })

    await this.#saveProfiles([...this.#profiles, profile])

    const created = this.infos().find(h => h.id === profileId(profile))

    if (!created) {
      throw new Error(`unknown_harness: ${profileId(profile)}`)
    }

    return { harness: created, skipped }
  }

  removeProfile = async (harness: string) => {
    const { dir, profile } = this.entry(harness)

    if (!profile || !dir) {
      throw new Error(m.error_global_delete())
    }

    await this.on.release(harness)
    await native("remove_path", { path: dir })
    await this.#saveProfiles(
      this.#profiles.filter(p => profileId(p) !== harness),
    )
    this.#forgetProvider(harness)

    return null
  }

  #saveProfiles = async (profiles: Profile[]) => {
    this.#profiles = profiles
    await saveProfiles(this.#home, profiles)
    await this.#build()
    this.on.changed()
  }

  #log = (harness: string) =>
    new Channel<string>(line => this.on.log(harness, line))

  #detect = async (force = false) => {
    const { harnesses, available } = await detectHarnesses(force)

    this.#base = harnesses
    this.#available = available
  }

  #build = async () => {
    const base: Entry[] = this.#base.map(h => ({
      ...h,
      base: h.id,
      kind: KINDS[h.id] ?? null,
      profile: null,
      dir: null,
    }))
    const profiles = await Promise.all(
      this.#profiles.flatMap(p => {
        const parent = base.find(b => b.id === p.base)
        const kind = parent?.kind

        if (!parent || !kind) {
          return []
        }

        return [
          profileDir(this.#home, p.id).then(
            (dir): Entry => ({
              id: profileId(p),
              name: `${parent.name} (${p.name})`,
              base: parent.id,
              kind,
              profile: p.name,
              local: false,
              login: null,
              source: null,
              dir,
              launch: {
                ...parent.launch,
                env: { ...parent.launch.env, ...envFor(kind, dir) },
              },
            }),
          ),
        ]
      }),
    )

    this.#entries = [...base, ...profiles]
  }
}
