import { appFile, appKeyOf } from "#lib/apps/app.ts"
import { holidays } from "#lib/calendar/calendar.svelte.ts"
import {
  addEvent,
  listEvents,
  listTags,
  putTag,
  toIso,
  toRow,
} from "#lib/calendar/events.ts"
import { newTag, tagLabel } from "#lib/calendar/tags.ts"
import { isBound, sendToChannel } from "#lib/channels/store.svelte.ts"
import type { Backend } from "#lib/datasource/client.ts"
import { datasourceCall, isWrite } from "#lib/datasource/native.ts"
import type { Actor } from "#lib/knowledge/document.ts"
import type { Knowledge } from "#lib/knowledge/service.ts"
import type { Answer, DatasourceRequest, Handlers } from "#lib/p2p/protocol.ts"
import type {
  AppsDesk,
  CalendarDesk,
  ChannelDesk,
  DatasourceDesk,
  KnowledgeDesk,
} from "./tools.ts"

type ActorOf = (sessionId: string) => Actor

export class Datasources {
  constructor(private readonly changed: (name: string | null) => void) {}

  call = async <R extends DatasourceRequest>(
    request: R,
  ): Promise<Answer<R>> => {
    const result = await datasourceCall(request)
    const sent: DatasourceRequest = request

    if (isWrite(sent)) {
      this.changed("name" in sent ? sent.name : null)
    }

    return result
  }

  handlers: Handlers<DatasourceRequest["op"]> = {
    "ds.list": r => this.call(r),
    "ds.create": r => this.call(r),
    "ds.delete": r => this.call(r),
    "ds.tables": r => this.call(r),
    "ds.query": r => this.call(r),
    "ds.execute": r => this.call(r),
    "ds.knowledge.get": r => this.call(r),
    "ds.knowledge.set": r => this.call(r),
  }

  names = () => datasourceCall({ op: "ds.list" })

  flagged = () => datasourceCall({ op: "ds.knowledge.get" })

  checkSources = async (sources: string[] | undefined) => {
    const flagged = await this.flagged()
    const unknown = (sources ?? []).filter(s => !flagged.includes(s))

    if (unknown.length > 0) {
      throw new Error(
        `sources_unflagged: ${unknown.join(", ")} is not a knowledge datasource; flag it with ds_execute knowledge: true`,
      )
    }
  }

  backend: Backend = {
    dsList: this.names,
    dsCreate: name => this.call({ op: "ds.create", name }),
    dsQuery: (name, sql, params = []) =>
      datasourceCall({ op: "ds.query", name, sql, params }),
    dsExecute: (name, sql, params = []) =>
      this.call({ op: "ds.execute", name, sql, params }),
  }

  desk: DatasourceDesk = {
    list: async () => {
      const names = await this.names()
      const flagged = await this.flagged()

      return Promise.all(
        names.map(async name => ({
          name,
          knowledge: flagged.includes(name),
          tables: await datasourceCall({ op: "ds.tables", name }),
        })),
      )
    },
    query: (name, sql, params) =>
      datasourceCall({ op: "ds.query", name, sql, params }),
    execute: async (name, sql, params, create, knowledge) => {
      const names = await this.names()

      if (create && !names.includes(name)) {
        await this.call({ op: "ds.create", name })
      }

      const result = await this.call({ op: "ds.execute", name, sql, params })

      if (knowledge !== undefined) {
        await this.call({ op: "ds.knowledge.set", name, on: knowledge })
      }

      return result
    },
  }
}

export const knowledgeDesk = (
  knowledge: Knowledge,
  data: Datasources,
  actorOf: ActorOf,
): KnowledgeDesk => ({
  list: prefix =>
    knowledge.store.list(prefix).map(e => ({
      id: e.meta.id,
      path: e.key,
      title: e.meta.title,
      tags: e.meta.tags,
      etag: e.etag,
    })),
  read: async (ref, versionId) => {
    const { meta, body, etag, key } = await knowledge.store.read(ref, versionId)

    return { path: key, etag, frontmatter: meta, body }
  },
  history: ref => knowledge.store.history(ref),
  create: async (sessionId, { path, body, ...fields }) => {
    await data.checkSources(fields.sources)

    return knowledge.save(() =>
      knowledge.store.create(
        path,
        {
          title: fields.title,
          description: fields.description ?? "",
          tags: fields.tags ?? [],
          scope: fields.scope ?? "network",
          links: fields.links ?? [],
          sources: fields.sources,
        },
        body,
        actorOf(sessionId),
      ),
    )
  },
  update: async (sessionId, { ref, etag, body, ...fields }) => {
    await data.checkSources(fields.sources)

    return knowledge.save(() =>
      knowledge.store.update(ref, etag, { fields, body }, actorOf(sessionId)),
    )
  },
  delete: (sessionId, ref, etag) =>
    knowledge.save(() => knowledge.store.delete(ref, etag, actorOf(sessionId))),
  watch: (sessionId, ref, on) => knowledge.watch(sessionId, ref, on),
})

export const appsDesk = (knowledge: Knowledge, actorOf: ActorOf): AppsDesk => ({
  list: () => knowledge.store.appList().map(a => a.key),
  save: async (sessionId, { title, icon, blocks }) => {
    const key = appKeyOf(title)
    const file = appFile.parse({ title, icon, blocks })
    const written = await knowledge.store.writeObject(
      key,
      null,
      file,
      actorOf(sessionId),
    )

    return { key, saved: written.ok }
  },
})

const tagIds = async (backend: Backend, names: string[]) => {
  const known = await listTags(backend)
  const ids: string[] = []

  for (const name of names) {
    const found = known.find(t => tagLabel(t) === name || t.name === name)
    const tag = found ?? newTag(known, name)

    if (!found) {
      await putTag(backend, tag)
      known.push(tag)
    }

    ids.push(tag.id)
  }

  return ids
}

export const calendarDesk = (
  data: Datasources,
  actorOf: ActorOf,
): CalendarDesk => ({
  list: async (from, to) => {
    await holidays.load()

    const [found, known] = await Promise.all([
      listEvents(
        data.backend,
        new Date(toIso(from)),
        new Date(toIso(to)),
        holidays.isHoliday,
      ),
      listTags(data.backend),
    ])

    return found.map(e => {
      const row = toRow(e)

      return {
        id: e.id,
        title: e.title,
        start: row.start,
        end: row.end,
        allDay: e.allDay,
        note: e.notes,
        recurrence: e.recurrence,
        until: e.until,
        seriesDate: e.seriesDate,
        shiftedFrom: e.shiftedFrom,
        tags: known.filter(t => e.tags.includes(t.id)).map(tagLabel),
        createdBy: e.createdBy,
      }
    })
  },
  add: async (sessionId, { tags, ...event }) =>
    addEvent(
      data.backend,
      { ...event, tags: await tagIds(data.backend, tags ?? []) },
      actorOf(sessionId).agent ?? sessionId,
    ),
})

export const channelDesk: ChannelDesk = {
  send: async (to, text) => {
    if (!isBound(to)) {
      throw new Error(
        `channel_unbound: ${to} is not bound in Settings > Channels`,
      )
    }

    await sendToChannel(to, text)

    return { sent: true }
  },
}
