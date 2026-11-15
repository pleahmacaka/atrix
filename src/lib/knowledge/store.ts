import { fetch } from "@tauri-apps/plugin-http"
import { AwsClient } from "aws4fetch"
import { native } from "#lib/native.ts"
import { type Canvas, canvas } from "./canvas.ts"
import {
  type Actor,
  assertTextOnly,
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

const DOC_EXTENSION = ".md"

const CANVAS_EXTENSION = ".canvas"

const APP_EXTENSION = ".app"

type Endpoint = { port: number; access: string; secret: string }

export type Edge = { to: string; rel: string }

export type Entry = {
  key: string
  etag: string
  meta: Frontmatter
  edges: Edge[]
}

export type Loaded = Entry & { body: string; text: string }

export type Saved = { ok: true; entry: Entry } | { ok: false; current: Loaded }

export type Version = {
  versionId: string
  etag: string
  modified: string
  latest: boolean
  deleted: boolean
  actor: Actor | null
}

export type Trashed = {
  key: string
  id: string
  title: string
  versionId: string
  deletedAt: string
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

const isoNow = (date = new Date()) => {
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

const keyOf = (path: string) => keyWith(path, DOC_EXTENSION)

const canvasKeyOf = (path: string) => keyWith(path, CANVAS_EXTENSION)

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

const etagOf = (response: Response) => response.headers.get("etag") ?? ""

const guard = (etag: string | null): Record<string, string> =>
  etag ? { "If-Match": etag } : { "If-None-Match": "*" }

const notFound = (ref: string): never => {
  throw new Error(`not_found: no document ${ref}`)
}

const exists = (key: string) => new Error(`exists: ${key} already exists`)

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

    const versioning = xml(
      await (await this.#ok(this.#send(`${this.#base}?versioning`))).text(),
    )

    if (textOf(versioning.documentElement, "Status") !== "Enabled") {
      throw new Error("kg_versioning_disabled: the bucket keeps no history")
    }

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

  read = async (ref: string, versionId?: string) =>
    this.#load(
      versionId
        ? await this.#resolve(ref)
        : (this.find(ref)?.key ?? notFound(ref)),
      versionId,
    )

  #load = async (key: string, versionId?: string): Promise<Loaded> => {
    const response = await this.#ok(this.#send(this.#url(key, versionId)))
    const text = await response.text()
    const doc = parseDoc(text)
    const loaded = {
      key,
      etag: etagOf(response),
      meta: doc.meta,
      edges: linksOf(doc),
      body: doc.body,
      text,
    }

    if (!versionId) {
      this.#entries.set(key, {
        key,
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

    const doc = { meta, body }

    assertTextOnly(doc)

    return this.#insert(key, doc, actor)
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

    assertTextOnly(doc)

    const response = await this.#put(current.key, doc, actor, guard(etag))

    if (response.status === 412) {
      throw new Conflict(await this.read(ref))
    }

    return this.#saved(current.key, doc, response, actor)
  }

  history = async (ref: string): Promise<Version[]> => {
    const key = await this.#resolve(ref)
    const versions = (await this.#versions(key)).filter(v => v.key === key)

    return Promise.all(
      versions.map(async ({ key: _, ...v }) => {
        if (v.deleted) {
          return { ...v, actor: null }
        }

        const head = await this.#send(this.#url(key, v.versionId), {
          method: "HEAD",
        })

        return { ...v, actor: actorOf(head.headers.get(ACTOR_HEADER)) }
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
    const { title, description, tags, scope, links, sources } = old.meta

    return this.update(
      ref,
      etag,
      {
        fields: { title, description, tags, scope, links, sources },
        body: old.body,
      },
      actor,
    )
  }

  delete = async (ref: string, etag: string, actor: Actor) => {
    const current = await this.read(ref)

    if (current.etag !== etag) {
      throw new Conflict(current)
    }

    await this.remove(current.key, actor)

    const { body: _, text: __, ...entry } = current

    return entry
  }

  trash = async (): Promise<Trashed[]> => {
    const all = await this.#versions("")
    const deleted = all.filter(
      v => v.deleted && v.latest && v.key.endsWith(DOC_EXTENSION),
    )

    const found = await Promise.all(
      deleted.map(async marker => {
        const last = all
          .filter(v => v.key === marker.key && !v.deleted)
          .toSorted((a, b) => b.modified.localeCompare(a.modified))[0]

        if (!last) {
          return null
        }

        const response = await this.#send(this.#url(marker.key, last.versionId))
        const doc = response.ok ? parseDocSafe(await response.text()) : null

        return doc
          ? {
              key: marker.key,
              id: doc.meta.id,
              title: doc.meta.title,
              versionId: last.versionId,
              deletedAt: marker.modified,
            }
          : null
      }),
    )

    return found
      .filter(t => t !== null)
      .toSorted((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  }

  restore = async (ref: string, versionId: string, actor: Actor) => {
    const key = await this.#resolve(ref)

    if (this.#entries.has(key)) {
      throw new Error(`exists: ${key} is not deleted; revert it instead`)
    }

    const old = await this.#load(key, versionId)
    const doc = {
      meta: {
        ...old.meta,
        updated_at: isoNow(),
        base_hash: hashOf(old.text),
        updated_by: actor,
      },
      body: old.body,
    }

    return this.#insert(key, doc, actor)
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
      etag: etagOf(response),
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
    const written = await this.writeObject(key, etag, canvas.parse(data), actor)

    return written.ok
      ? { ok: true, entry: { key, etag: written.etag } }
      : { ok: false, current: await this.readCanvas(key) }
  }

  folderList = () => [...this.#folders].toSorted()

  appList = () =>
    [...this.#apps.values()].toSorted((a, b) => a.key.localeCompare(b.key))

  readObject = async (path: string): Promise<StoredObject | null> => {
    const key = keyWith(path, "")
    const response = await this.#send(this.#url(key))

    if (response.status === 404) {
      return null
    }

    await this.#ok(response)

    return {
      key,
      etag: etagOf(response),
      value: await response.json(),
    }
  }

  writeObject = async (
    path: string,
    etag: string | null,
    value: unknown,
    actor: Actor,
  ): Promise<WrittenObject> => {
    const key = keyWith(path, "")

    if (!key || key.endsWith(DOC_EXTENSION)) {
      throw new Error(`invalid_key: ${path} is not an object key`)
    }

    const response = await this.#write(
      key,
      JSON.stringify(value, null, 2),
      "application/json",
      actor,
      guard(etag),
    )

    if (response.status === 412) {
      return { ok: false }
    }

    await this.#ok(response)

    const entry = { key, etag: etagOf(response) }

    if (key.endsWith(APP_EXTENSION)) {
      this.#apps.set(key, entry)
    }

    if (key.endsWith(CANVAS_EXTENSION)) {
      this.#canvases.set(key, entry)
    }

    this.#notify({ id: key, key, etag: entry.etag, actor })

    return { ok: true, etag: entry.etag }
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
    await Promise.all(
      this.#under(keyWith(path, "")).map(key =>
        this.#ok(this.#send(this.#url(key), { method: "DELETE" })),
      ),
    )
    await this.#reindex()
    this.#notify({ id: path, key: path, etag: "", actor })
  }

  move = async (from: string, to: string, actor: Actor) => {
    const source = keyWith(from, "")
    const extension =
      [DOC_EXTENSION, CANVAS_EXTENSION].find(e => source.endsWith(e)) ?? ""
    const target = keyWith(to, extension)
    const keys = this.#under(source)

    if (!target || target === source || keys.length === 0) {
      return
    }

    const taken = new Set(this.#under(target))
    const clash = keys
      .map(key => target + key.slice(source.length))
      .find(destination => taken.has(destination))

    if (clash) {
      throw exists(clash)
    }

    for (const key of keys) {
      const destination = target + key.slice(source.length)
      const response = await this.#ok(this.#send(this.#url(key)))
      const written = await this.#write(
        destination,
        await response.text(),
        response.headers.get("content-type") ?? "application/octet-stream",
        actor,
        guard(null),
      )

      if (written.status === 412) {
        throw exists(destination)
      }

      await this.#ok(written)
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

  #resolve = async (ref: string) => {
    const live = this.find(ref)?.key

    if (live) {
      return live
    }

    const key = keyOf(ref)
    const trashed = (await this.trash()).find(
      t => t.id === ref || t.key === key,
    )

    return trashed?.key ?? notFound(ref)
  }

  #versions = async (prefix: string) => {
    const found: (Omit<Version, "actor"> & { key: string })[] = []
    let marker = ""

    do {
      const query = `?versions&prefix=${encodeURIComponent(prefix)}${marker}`
      const page = xml(
        await (await this.#ok(this.#send(this.#base + query))).text(),
      )
      const root = page.documentElement
      const nodes = [...root.children].filter(
        n => n.tagName === "Version" || n.tagName === "DeleteMarker",
      )

      found.push(
        ...nodes.map(n => ({
          key: textOf(n, "Key"),
          versionId: textOf(n, "VersionId"),
          etag: textOf(n, "ETag"),
          modified: textOf(n, "LastModified"),
          latest: textOf(n, "IsLatest") === "true",
          deleted: n.tagName === "DeleteMarker",
        })),
      )

      const truncated = textOf(root, "IsTruncated") === "true"
      const nextKey = textOf(root, "NextKeyMarker")
      const nextVersion = textOf(root, "NextVersionIdMarker")

      marker = truncated
        ? `&key-marker=${encodeURIComponent(nextKey)}&version-id-marker=${encodeURIComponent(nextVersion)}`
        : ""
    } while (marker)

    return found
  }

  #notify = (change: Change) => {
    for (const listener of this.#listeners) {
      listener(change)
    }
  }

  #url = (key: string, versionId?: string) => {
    const path = `${this.#base}/${key.split("/").map(encodeURIComponent).join("/")}`

    return versionId
      ? `${path}?versionId=${encodeURIComponent(versionId)}`
      : path
  }

  #send = async (url: string, init: RequestInit = {}) => {
    if (!this.#client) {
      throw new Error("kg_not_started")
    }

    return fetch(await this.#client.sign(url, init))
  }

  #ok = async (pending: Response | Promise<Response>) => {
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

  #insert = async (key: string, doc: Doc, actor: Actor) => {
    const response = await this.#put(key, doc, actor, guard(null))

    if (response.status === 412) {
      throw exists(key)
    }

    return this.#saved(key, doc, response, actor)
  }

  #saved = async (key: string, doc: Doc, response: Response, actor: Actor) => {
    await this.#ok(response)

    const { meta } = doc
    const entry = {
      key,
      etag: etagOf(response),
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

      keys.push(
        ...contents.map(c => c.key).filter(k => k.endsWith(DOC_EXTENSION)),
      )
      folders.push(
        ...contents
          .map(c => c.key)
          .filter(k => k.endsWith("/"))
          .map(k => k.slice(0, -1)),
      )
      canvases.push(...contents.filter(c => c.key.endsWith(CANVAS_EXTENSION)))
      apps.push(...contents.filter(c => c.key.endsWith(APP_EXTENSION)))
      token = textOf(page.documentElement, "NextContinuationToken")
    } while (token)

    const listed = new Set(keys)

    for (const key of this.#entries.keys()) {
      if (!listed.has(key)) {
        this.#entries.delete(key)
      }
    }

    this.#canvases = new Map(canvases.map(c => [c.key, c]))
    this.#folders = new Set(folders)
    this.#apps = new Map(apps.map(a => [a.key, a]))

    for (const key of keys) {
      const response = await this.#send(this.#url(key))
      const doc = response.ok ? parseDocSafe(await response.text()) : null

      if (doc) {
        this.#entries.set(key, {
          key,
          etag: etagOf(response),
          meta: doc.meta,
          edges: linksOf(doc),
        })
      } else {
        this.#entries.delete(key)
      }
    }
  }
}
