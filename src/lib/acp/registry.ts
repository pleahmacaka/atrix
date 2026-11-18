import { Channel } from "@tauri-apps/api/core"
import { native } from "#lib/native.ts"
import type {
  Available,
  HarnessInfo,
  HarnessKind,
  Installed,
  InstallScope,
  ProviderChoice,
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
import { servesKind, withProvider } from "./provider.ts"
import {
  disabledHarnesses,
  providerChoices,
  saveDisabled,
  saveProvider,
} from "./saved.ts"

export type Entry = Omit<
  HarnessInfo,
  "enabled" | "provider" | "providerActive"
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
        providerActive: this.providing(h.id),
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

  usingGateway = (gateway: string) =>
    Object.entries(this.#providers)
      .filter(([, picked]) => picked.gateway === gateway)
      .map(([id]) => id)

  #forgetProvider = (id: string) => {
    this.#providers = saveProvider(id, null)
  }

  #resolve = (id: string, picked: ProviderChoice | undefined) => {
    const kind = this.find(id)?.kind
    const gateway = picked && findGateway(picked.gateway)

    return kind && picked?.model && gateway && servesKind(kind, gateway)
      ? { kind, gateway, model: picked.model }
      : null
  }

  #provided = (id: string) => this.#resolve(id, this.#providers[id])

  providing = (id: string) => this.#provided(id) !== null

  launchOf = (id: string) => {
    const { launch } = this.entry(id)
    const provided = this.#provided(id)

    return provided
      ? withProvider(provided.kind, launch, provided.gateway, provided.model)
      : launch
  }

  setProvider = (id: string, picked: ProviderChoice | null) => {
    this.entry(id)

    if (picked && !this.#resolve(id, picked)) {
      throw new Error(m.error_provider_invalid())
    }

    const before = this.#providers[id]
    const same =
      before?.gateway === picked?.gateway && before?.model === picked?.model

    if (same) {
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
