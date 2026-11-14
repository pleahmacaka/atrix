import { fetch } from "@tauri-apps/plugin-http"
import { AwsClient } from "aws4fetch"
import { native } from "#lib/acp/native.ts"
import { type Canvas, canvas } from "./canvas.ts"
import {
  type Actor,
  type Doc,
  type Editable,
  editable,
  type Frontmatter,
  hashOf,
  linksOf,
  newId,
  parseDoc,
  serializeDoc,
} from "./document.ts"

const BUCKET = "atrix-kg"

const VERSIONING = `<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Status>Enabled</Status></VersioningConfiguration>`

const ACTOR_HEADER = "x-amz-meta-actor"

type Endpoint = { port: number; access: string; secret: string }

export type Edge = { to: string; rel: string }

export type Entry = {
  key: string
  etag: string
  meta: Frontmatter
  edges: Edge[]
}

export type Loaded = Entry & { body: string; text: string }

export type Version = {
  versionId: string
  etag: string
  modified: string
  latest: boolean
  actor: Actor | null
}

export type Change = { id: string; key: string; etag: string; actor: Actor }

export type Patch = { fields?: Partial<Editable>; body?: string }

export type CanvasEntry = { key: string; etag: string }

export type StoredObject = { key: string; etag: string; value: unknown }

export type WrittenObject = { ok: true; etag: string } | { ok: false }

export type LoadedCanvas = CanvasEntry & { canvas: Canvas }

export type SavedCanvas =
  | { ok: true; entry: CanvasEntry }
  | { ok: false; current: LoadedCanvas }

export class Conflict extends Error {
  constructor(readonly current: Loaded) {
    super(`conflict: ${current.meta.id} changed, latest etag ${current.etag}`)
  }
}

const randomHex = () =>
  [...crypto.getRandomValues(new Uint8Array(20))]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")

const pad = (n: number) => String(n).padStart(2, "0")

export const isoNow = (date = new Date()) => {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? "+" : "-"
  const local = new Date(date.getTime() + offset * 60_000)
    .toISOString()
    .slice(0, 19)

  return `${local}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
}

const keyWith = (path: string, extension: string) => {
  const clean = path
    .replaceAll("\\", "/")
    .split("/")
    .filter(p => p && p !== "." && p !== "..")
    .join("/")

  return clean.endsWith(extension) ? clean : `${clean}${extension}`
}

const keyOf = (path: string) => keyWith(path, ".md")

export const canvasKeyOf = (path: string) => keyWith(path, ".canvas")

const xml = (text: string) =>
  new DOMParser().parseFromString(text, "application/xml")

const textOf = (node: Element, tag: string) =>
  node.getElementsByTagName(tag)[0]?.textContent ?? ""

const parseDocSafe = (text: string) => {
  try {
    return parseDoc(text)
  } catch {
    return null
  }
}

const actorOf = (header: string | null): Actor | null => {
  try {
    return header ? JSON.parse(decodeURIComponent(header)) : null
  } catch {
    return null
  }
}

export class KnowledgeStore {
  #client: AwsClient | null = null

  #base = ""

  #entries = new Map<string, Entry>()

  #canvases = new Map<string, CanvasEntry>()

  #folders = new Set<string>()

  #apps = new Map<string, CanvasEntry>()

  #listeners = new Set<(change: Change) => void>()

  start = async () => {
    const endpoint = await native<Endpoint>("kg_start", {
      access: randomHex(),
      secret: randomHex(),
    })

    this.#client = new AwsClient({
      accessKeyId: endpoint.access,
      secretAccessKey: endpoint.secret,
      service: "s3",
      region: "us-east-1",
    })
    this.#base = `http://127.0.0.1:${endpoint.port}/${BUCKET}`

    if ((await this.#send(this.#base, { method: "HEAD" })).status === 404) {
      await this.#ok(this.#send(this.#base, { method: "PUT" }))
    }

    await this.#ok(
      this.#send(`${this.#base}?versioning`, {
        method: "PUT",
        body: VERSIONING,
      }),
    )
    await this.#reindex()
  }

  subscribe = (listener: (change: Change) => void) => {
    this.#listeners.add(listener)

    return () => {
      this.#listeners.delete(listener)
    }
  }

  list = (prefix = "") =>
    [...this.#entries.values()]
      .filter(e => e.key.startsWith(prefix))
      .toSorted((a, b) => a.key.localeCompare(b.key))

  find = (ref: string) =>
    this.#entries.get(keyOf(ref)) ??
    [...this.#entries.values()].find(e => e.meta.id === ref)

  read = async (ref: string, versionId?: string): Promise<Loaded> => {
    const known = this.find(ref)

    if (!known) {
      throw new Error(`not_found: no document ${ref}`)
    }

    const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : ""
    const response = await this.#ok(this.#send(this.#url(known.key) + query))
    const text = await response.text()
    const doc = parseDoc(text)
    const loaded = {
      key: known.key,
      etag: response.headers.get("etag") ?? "",
      meta: doc.meta,
      edges: linksOf(doc),
      body: doc.body,
      text,
    }

    if (!versionId) {
      this.#entries.set(known.key, {
        key: known.key,
        etag: loaded.etag,
        meta: doc.meta,
        edges: loaded.edges,
      })
    }

    return loaded
  }

  create = async (
    path: string,
    fields: Editable,
    body: string,
    actor: Actor,
  ) => {
    const key = keyOf(path)
    const now = isoNow()
    const meta: Frontmatter = {
      ...editable.parse(fields),
      id: newId(),
      created_at: now,
      updated_at: now,
      base_hash: null,
      created_by: actor,
      updated_by: actor,
    }
    const response = await this.#put(key, { meta, body }, actor, {
      "If-None-Match": "*",
    })

    if (response.status === 412) {
      throw new Error(`exists: ${key} already exists`)
    }

    return this.#saved(key, { meta, body }, response, actor)
  }

  update = async (ref: string, etag: string, patch: Patch, actor: Actor) => {
    const current = await this.read(ref)

    if (current.etag !== etag) {
      throw new Conflict(current)
    }

    const meta: Frontmatter = {
      ...current.meta,
      ...editable.parse({ ...current.meta, ...patch.fields }),
      updated_at: isoNow(),
      base_hash: hashOf(current.text),
      updated_by: actor,
    }
    const doc = { meta, body: patch.body ?? current.body }
    const response = await this.#put(current.key, doc, actor, {
      "If-Match": etag,
    })

    if (response.status === 412) {
      throw new Conflict(await this.read(ref))
    }

    return this.#saved(current.key, doc, response, actor)
  }

  history = async (ref: string): Promise<Version[]> => {
    const known = this.find(ref)

    if (!known) {
      throw new Error(`not_found: no document ${ref}`)
    }

    const query = `?versions&prefix=${encodeURIComponent(known.key)}`
    const listing = xml(
      await (await this.#ok(this.#send(this.#base + query))).text(),
    )
    const versions = [...listing.getElementsByTagName("Version")].filter(
      v => textOf(v, "Key") === known.key,
    )

    return Promise.all(
      versions.map(async v => {
        const versionId = textOf(v, "VersionId")
        const head = await this.#send(
          `${this.#url(known.key)}?versionId=${encodeURIComponent(versionId)}`,
          { method: "HEAD" },
        )

        return {
          versionId,
          etag: textOf(v, "ETag"),
          modified: textOf(v, "LastModified"),
          latest: textOf(v, "IsLatest") === "true",
          actor: actorOf(head.headers.get(ACTOR_HEADER)),
        }
      }),
    )
  }

  revert = async (
    ref: string,
    versionId: string,
    etag: string,
    actor: Actor,
  ) => {
    const old = await this.read(ref, versionId)
    const { title, description, tags, scope, links } = old.meta

    return this.update(
      ref,
      etag,
      { fields: { title, description, tags, scope, links }, body: old.body },
      actor,
    )
  }

  graph = () => {
    const ids = new Set([...this.#entries.values()].map(e => e.meta.id))

    return [...this.#entries.values()].flatMap(e =>
      e.edges
        .filter(l => ids.has(l.to))
        .map(l => ({ from: e.meta.id, to: l.to, rel: l.rel })),
    )
  }

  canvasList = () =>
    [...this.#canvases.values()].toSorted((a, b) => a.key.localeCompare(b.key))

  readCanvas = async (path: string): Promise<LoadedCanvas> => {
    const key = canvasKeyOf(path)
    const response = await this.#ok(this.#send(this.#url(key)))

    return {
      key,
      etag: response.headers.get("etag") ?? "",
      canvas: canvas.parse(await response.json()),
    }
  }

  saveCanvas = async (
    path: string,
    etag: string | null,
    data: Canvas,
    actor: Actor,
  ): Promise<SavedCanvas> => {
    const key = canvasKeyOf(path)
    const response = await this.#write(
      key,
      JSON.stringify(canvas.parse(data), null, 2),
      "application/json",
      actor,
      etag ? { "If-Match": etag } : { "If-None-Match": "*" },
    )

    if (response.status === 412) {
      return { ok: false, current: await this.readCanvas(key) }
    }

    await this.#ok(Promise.resolve(response))

    const entry = { key, etag: response.headers.get("etag") ?? "" }

    this.#canvases.set(key, entry)
    this.#notify({ id: key, key, etag: entry.etag, actor })

    return { ok: true, entry }
  }

  folderList = () => [...this.#folders].toSorted()

  appList = () =>
    [...this.#apps.values()].toSorted((a, b) => a.key.localeCompare(b.key))

  readObject = async (key: string): Promise<StoredObject | null> => {
    const response = await this.#send(this.#url(key))

    if (response.status === 404) {
      return null
    }

    await this.#ok(Promise.resolve(response))

    return {
      key,
      etag: response.headers.get("etag") ?? "",
      value: await response.json(),
    }
  }

  writeObject = async (
    key: string,
    etag: string | null,
    value: unknown,
    actor: Actor,
  ): Promise<WrittenObject> => {
    const response = await this.#write(
      key,
      JSON.stringify(value, null, 2),
      "application/json",
      actor,
      etag ? { "If-Match": etag } : { "If-None-Match": "*" },
    )

    if (response.status === 412) {
      return { ok: false }
    }

    await this.#ok(Promise.resolve(response))

    const written = response.headers.get("etag") ?? ""

    if (key.endsWith(".app")) {
      this.#apps.set(key, { key, etag: written })
    }

    this.#notify({ id: key, key, etag: written, actor })

    return { ok: true, etag: written }
  }

  createFolder = async (path: string, actor: Actor) => {
    const folder = keyWith(path, "")

    if (!folder) {
      throw new Error(`invalid_path: ${path}`)
    }

    await this.#ok(
      this.#write(`${folder}/`, "", "application/x-directory", actor, {}),
    )
    await this.#reindex()
    this.#notify({ id: folder, key: folder, etag: "", actor })
  }

  remove = async (path: string, actor: Actor) => {
    const keys = this.#under(keyWith(path, ""))

    for (const key of keys) {
      await this.#ok(this.#send(this.#url(key), { method: "DELETE" }))
    }

    await this.#reindex()
    this.#notify({ id: path, key: path, etag: "", actor })
  }

  move = async (from: string, to: string, actor: Actor) => {
    const source = keyWith(from, "")
    const extension = [".md", ".canvas"].find(e => source.endsWith(e)) ?? ""
    const target = keyWith(to, extension)
    const keys = this.#under(source)

    if (!target || target === source || keys.length === 0) {
      return
    }

    for (const key of keys) {
      const destination = target + key.slice(source.length)
      const response = await this.#ok(this.#send(this.#url(key)))
      const written = await this.#write(
        destination,
        await response.text(),
        response.headers.get("content-type") ?? "application/octet-stream",
        actor,
        { "If-None-Match": "*" },
      )

      if (written.status === 412) {
        throw new Error(`exists: ${destination} already exists`)
      }

      await this.#ok(Promise.resolve(written))
      await this.#ok(this.#send(this.#url(key), { method: "DELETE" }))
    }

    await this.#reindex()
    this.#notify({ id: target, key: target, etag: "", actor })
  }

  #under = (path: string) =>
    [
      ...this.#entries.keys(),
      ...this.#canvases.keys(),
      ...this.#apps.keys(),
      ...[...this.#folders].map(f => `${f}/`),
    ].filter(k => k === path || k.startsWith(`${path}/`))

  #notify = (change: Change) => {
    for (const listener of this.#listeners) {
      listener(change)
    }
  }

  #url = (key: string) =>
    `${this.#base}/${key.split("/").map(encodeURIComponent).join("/")}`

  #send = async (url: string, init: RequestInit = {}) => {
    if (!this.#client) {
      throw new Error("kg_not_started")
    }

    return fetch(await this.#client.sign(url, init))
  }

  #ok = async (pending: Promise<Response>) => {
    const response = await pending

    if (!response.ok) {
      throw new Error(
        `kg_store_${response.status}: ${(await response.text()).slice(0, 200)}`,
      )
    }

    return response
  }

  #put = (
    key: string,
    doc: Doc,
    actor: Actor,
    headers: Record<string, string>,
  ) =>
    this.#write(
      key,
      serializeDoc(doc),
      "text/markdown; charset=utf-8",
      actor,
      headers,
    )

  #write = (
    key: string,
    body: string,
    type: string,
    actor: Actor,
    headers: Record<string, string>,
  ) =>
    this.#send(this.#url(key), {
      method: "PUT",
      body,
      headers: {
        ...headers,
        "Content-Type": type,
        [ACTOR_HEADER]: encodeURIComponent(JSON.stringify(actor)),
      },
    })

  #saved = async (key: string, doc: Doc, response: Response, actor: Actor) => {
    await this.#ok(Promise.resolve(response))

    const { meta } = doc
    const entry = {
      key,
      etag: response.headers.get("etag") ?? "",
      meta,
      edges: linksOf(doc),
    }

    this.#entries.set(key, entry)

    this.#notify({ id: meta.id, key, etag: entry.etag, actor })

    return entry
  }

  #reindex = async () => {
    const keys: string[] = []
    const canvases: CanvasEntry[] = []
    const apps: CanvasEntry[] = []
    const folders: string[] = []
    let token = ""

    do {
      const query = `?list-type=2${token ? `&continuation-token=${encodeURIComponent(token)}` : ""}`
      const page = xml(
        await (await this.#ok(this.#send(this.#base + query))).text(),
      )

      const contents = [...page.getElementsByTagName("Contents")].map(c => ({
        key: textOf(c, "Key"),
        etag: textOf(c, "ETag"),
      }))

      keys.push(...contents.map(c => c.key).filter(k => k.endsWith(".md")))
      folders.push(
        ...contents
          .map(c => c.key)
          .filter(k => k.endsWith("/"))
          .map(k => k.slice(0, -1)),
      )
      canvases.push(...contents.filter(c => c.key.endsWith(".canvas")))
      apps.push(...contents.filter(c => c.key.endsWith(".app")))
      token = textOf(page.documentElement, "NextContinuationToken")
    } while (token)

    this.#entries.clear()
    this.#canvases = new Map(canvases.map(c => [c.key, c]))
    this.#folders = new Set(folders)
    this.#apps = new Map(apps.map(a => [a.key, a]))

    for (const key of keys) {
      const response = await this.#send(this.#url(key))

      if (!response.ok) {
        continue
      }

      const doc = parseDocSafe(await response.text())

      if (doc) {
        this.#entries.set(key, {
          key,
          etag: response.headers.get("etag") ?? "",
          meta: doc.meta,
          edges: linksOf(doc),
        })
      }
    }
  }
}
