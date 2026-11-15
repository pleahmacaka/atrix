import type { Block } from "#lib/chat/blocks.ts"
import { knowledgeHost } from "#lib/knowledge/host.ts"
import { m } from "#lib/paraglide/messages.js"
import {
  type AppFile,
  appFile,
  appKeyOf,
  arrange,
  HOME_KEY,
  type Home,
  home,
  type Tile,
} from "./app.ts"

export type LoadedApp = AppFile & { key: string; etag: string }

const hostOf = () => {
  const host = knowledgeHost()

  if (!host?.state?.knowledge.ready) {
    throw new Error(m.apps_store_unavailable())
  }

  return host
}

class Apps {
  home = $state<Home>({ tiles: [] })

  byKey = $state<Record<string, LoadedApp>>({})

  #etag: string | null = null

  refresh = async () => {
    await hostOf().loadKnowledge()
    await this.load()
  }

  load = async () => {
    const host = hostOf()
    const keys = host.apps.map(a => a.key)
    const loaded = await Promise.all(keys.map(k => host.readObject(k)))
    const apps: Record<string, LoadedApp> = {}

    for (const stored of loaded) {
      const parsed = stored ? appFile.safeParse(stored.value) : null

      if (stored && parsed?.success) {
        apps[stored.key] = {
          ...parsed.data,
          key: stored.key,
          etag: stored.etag,
        }
      }
    }

    const layout = await host.readObject(HOME_KEY)
    const saved = layout ? home.safeParse(layout.value) : null

    this.#etag = layout?.etag ?? null
    this.byKey = apps
    this.home = arrange(saved?.success ? saved.data : null, Object.keys(apps))
  }

  arrangeTiles = async (tiles: Tile[]) => {
    this.home = { tiles }

    const written = await hostOf().writeObject(HOME_KEY, this.#etag, this.home)

    if (written.ok) {
      this.#etag = written.etag
    } else {
      await this.load()
    }
  }

  save = async (title: string, blocks: Block[]) => {
    const key = appKeyOf(title)
    const file = appFile.parse({ title, blocks })

    await hostOf().writeObject(key, null, file)
    await this.refresh()

    return key
  }

  rename = async (key: string, title: string) => {
    const app = this.byKey[key]

    if (!app || !title.trim()) {
      return
    }

    const { key: _key, etag, ...file } = app

    await hostOf().writeObject(key, etag, { ...file, title: title.trim() })
    await this.refresh()
  }

  remove = async (key: string) => {
    await hostOf().removePath(key)
    await this.refresh()
  }
}

export const apps = new Apps()
