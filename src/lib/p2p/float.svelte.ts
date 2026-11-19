import { emitTo } from "@tauri-apps/api/event"
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from "@tauri-apps/api/webviewWindow"
import type { ChatStatus, FileUIPart } from "ai"
import { untrack } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { chats } from "#lib/chat/chats.svelte.ts"
import {
  type ChatLike,
  type ChatMessage,
  chatFor,
} from "#lib/chat/live.svelte.ts"
import { logFailure } from "#lib/logging.ts"
import { native } from "#lib/native.ts"
import { keyOf } from "#lib/store/keys.ts"
import {
  type Current,
  nav,
  openConversation,
  openSettings,
  type Page,
  type SettingsTab,
} from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import {
  adoptLocal,
  adoptRemotes,
  hostById,
  hostList,
  LOCAL,
} from "./hosts.svelte.ts"
import { HostView } from "./hostView.svelte.ts"
import {
  type Answers,
  type HostEvent,
  type HostRequest,
  type Op,
  type Reply,
  type RequestOf,
  reply,
} from "./protocol.ts"

type Session = { kind: "session"; host: string; id: string }

type Call = {
  label: string
  seq: number
  host: string
  token: string
  request: HostRequest
}

type Outgoing = { text: string; files?: FileUIPart[] }

type ChatOp = { op: "sync" | "stop" } | { op: "send"; message: Outgoing }

type ChatCall = { label: string; id: string } & ChatOp

type ChatFrame = {
  messages: ChatMessage[]
  status: ChatStatus
  error: string | null
}

const MAIN = "main"

export const SIDEBAR = "sidebar"

export type NavFrame = {
  page: Page
  current: Current
  agent: string | null
  doc: string | null
  table: { name: string; table: string } | null
  harness: { host: string; id: string } | null
  settings: SettingsTab | null
  palette: boolean
  seq: number
  origin: string
  hosts: { id: string; name: string; instance: string }[]
}

export type HostEntry = NavFrame["hosts"][number]

export const eventsOf = (host: string) => `float:event:${host}`

const hostEntries = (): HostEntry[] =>
  hostList().map(h => ({ id: h.id, name: h.name, instance: h.view.instance }))

const tapHosts = (label: string, keep: (event: HostEvent) => boolean) => {
  const hostIds = $derived(
    hostList()
      .map(h => `${h.id}#${h.view.instance}`)
      .join(" "),
  )

  $effect(() => {
    void hostIds

    const taps = untrack(hostList).map(({ id, view }) => {
      const tap = (event: HostEvent) => {
        if (keep(event)) {
          emitTo(label, eventsOf(id), event).catch(e =>
            logFailure("float event", e),
          )
        }
      }

      view.taps.add(tap)

      return () => view.taps.delete(tap)
    })

    return () => {
      for (const untap of taps) {
        untap()
      }
    }
  })
}

export class RemoteHosts {
  #remotes = new Map<
    string,
    ReturnType<typeof remoteHost> & { instance: string }
  >()

  #adopted = ""

  connect = (hosts: HostEntry[]) => {
    const wanted = new Set(hosts.map(h => h.id))
    const instances = new Map(hosts.map(h => [h.id, h.instance]))

    for (const [id, remote] of this.#remotes) {
      if (!wanted.has(id) || instances.get(id) !== remote.instance) {
        remote.stop()
        this.#remotes.delete(id)

        if (id === LOCAL) {
          adoptLocal(null)
        }
      }
    }

    for (const { id, instance } of hosts) {
      if (this.#remotes.has(id)) {
        continue
      }

      const remote = { ...remoteHost(id, eventsOf(id)), instance }

      this.#remotes.set(id, remote)
      remote.ready
        .then(() => remote.view.refresh())
        .catch(e => logFailure("float host refresh", e))

      if (id === LOCAL) {
        adoptLocal(remote.view)
      }
    }

    const entries = hosts.flatMap(({ id, name }) => {
      const remote = id === LOCAL ? undefined : this.#remotes.get(id)

      return remote ? [{ id, name, view: remote.view }] : []
    })
    const key = JSON.stringify(
      entries.map(e => [e.id, e.name, e.view.instance]),
    )

    if (key !== this.#adopted) {
      this.#adopted = key
      adoptRemotes(entries)
    }
  }

  stop = () => {
    for (const remote of this.#remotes.values()) {
      remote.stop()
    }

    this.#remotes.clear()
    adoptLocal(null)
    adoptRemotes([])
  }
}

const concerns = (event: HostEvent, id: string) => {
  switch (event.type) {
    case "state":
      return true
    case "view":
      return event.view.id === id
    case "update":
    case "patch":
      return event.sessionId === id
    default:
      return false
  }
}

export const floating = new SvelteMap<string, string>()

const answer = async (call: Call): Promise<Reply> => {
  try {
    const view = hostById(call.host)

    if (!view) {
      throw new Error(call.host)
    }

    return { ok: true, value: await view.call(call.request) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

const frameOf = (chat: ChatLike) => ({
  messages: $state.snapshot<unknown>(chat.messages),
  status: chat.status,
  error: chat.error?.message ?? null,
})

const runChat = async (call: ChatCall) => {
  const stored = chats.find(call.id)

  if (!stored) {
    return
  }

  const chat = chatFor(stored)

  if (call.op === "send") {
    await chat.sendMessage(call.message)
  } else if (call.op === "stop") {
    await chat.stop()
  } else {
    await emitTo(call.label, "float:chat", frameOf(chat))
  }
}

let serving = false

const serve = () => {
  if (serving) {
    return
  }

  serving = true

  const win = getCurrentWebviewWindow()

  win
    .listen<Call>("float:call", async ({ payload }) => {
      const result = await answer(payload)

      await emitTo(payload.label, "float:reply", {
        seq: payload.seq,
        token: payload.token,
        ...result,
      })
    })
    .catch(e => logFailure("float serve", e))
  win
    .listen<ChatCall>("float:chat-call", ({ payload }) => {
      runChat(payload).catch(e => logFailure("float chat", e))
    })
    .catch(e => logFailure("float serve", e))
  win
    .listen<NavFrame>("float:nav", ({ payload }) => applyNav(payload))
    .catch(e => logFailure("float serve", e))
}

type NavKey = "page" | "current" | "agent" | "doc" | "table" | "harness"

const NAV_KEYS: NavKey[] = [
  "page",
  "current",
  "agent",
  "doc",
  "table",
  "harness",
]

const navId = (frame: Omit<NavFrame, "hosts">, key: NavKey) => {
  switch (key) {
    case "current":
      return frame.current ? keyOf(frame.current) : ""
    case "table":
      return frame.table ? `${frame.table.name}/${frame.table.table}` : ""
    case "harness":
      return frame.harness ? `${frame.harness.host}/${frame.harness.id}` : ""
    default:
      return frame[key] ?? ""
  }
}

export const navSignature = (frame: Omit<NavFrame, "hosts">) =>
  JSON.stringify(NAV_KEYS.map(key => navId(frame, key)))

let floated: NavFrame | null = null

let applied = 0

const ORIGIN = crypto.randomUUID()

const applyNav = (frame: NavFrame) => {
  applied = Math.max(applied, frame.seq)

  if (frame.settings) {
    openSettings(frame.settings)
    getCurrentWebviewWindow()
      .setFocus()
      .catch(e => logFailure("float focus", e))

    return
  }

  if (frame.palette) {
    nav.palette = true
    getCurrentWebviewWindow()
      .setFocus()
      .catch(e => logFailure("float focus", e))

    return
  }

  const changed = (key: NavKey) =>
    !floated || navId(frame, key) !== navId(floated, key)
  const shown = panes.active.current

  if (
    changed("current") &&
    (frame.current ? !shown || keyOf(frame.current) !== keyOf(shown) : !!shown)
  ) {
    openConversation(frame.current)
  } else if (changed("page")) {
    nav.page = frame.page
  }

  if (changed("agent")) {
    nav.agent = frame.agent
  }

  if (changed("doc")) {
    nav.doc = frame.doc
  }

  if (changed("table")) {
    nav.table = frame.table
  }

  if (changed("harness")) {
    nav.harness = frame.harness
  }

  floated = frame
}

export const navState = (): Omit<NavFrame, "hosts"> => ({
  page: nav.page,
  current: $state.snapshot(panes.active.current),
  agent: nav.agent,
  doc: nav.doc,
  table: $state.snapshot(nav.table),
  harness: $state.snapshot(nav.harness),
  settings: null,
  palette: false,
  seq: applied,
  origin: ORIGIN,
})

const navFrame = (): NavFrame => ({ ...navState(), hosts: hostEntries() })

export const floatSidebar = async (title: string) => {
  if (!floating.has(SIDEBAR)) {
    floated = null
    applied = 0
  }

  await openWindow(SIDEBAR, { sidebar: "1" }, title, label =>
    $effect.root(() => {
      const emit = () => {
        const frame = navFrame()

        floated = frame
        emitTo(label, "float:nav", frame).catch(e => logFailure("float nav", e))
      }

      $effect(emit)

      const ready = getCurrentWebviewWindow().listen<string>(
        "float:ready",
        ({ payload }) => {
          if (payload === label) {
            emit()
          }
        },
      )

      // the sidebar never renders chat items, and updates are per-token stream traffic
      tapHosts(label, event => event.type !== "update")

      return () => {
        ready.then(f => f())
      }
    }),
  )
}

export const sendNav = (frame: NavFrame) => emitTo(MAIN, "float:nav", frame)

export const askNav = () =>
  emitTo(MAIN, "float:ready", getCurrentWebviewWindow().label)

const openWindow = async (
  key: string,
  query: Record<string, string>,
  title: string,
  attach: (label: string) => () => void,
) => {
  const open = floating.get(key)

  if (open) {
    await (await WebviewWindow.getByLabel(open))?.setFocus()

    return
  }

  serve()

  const label = `float-${crypto.randomUUID()}`
  const detach = attach(label)
  const done = () => {
    detach()
    floating.delete(key)
  }

  floating.set(key, label)

  try {
    await native("float_open", {
      label,
      url: `/float?${new URLSearchParams(query)}`,
      title,
    })
  } catch (e) {
    done()
    throw e
  }

  const win = await WebviewWindow.getByLabel(label)

  if (!win) {
    done()

    return
  }

  win.once("tauri://destroyed", done)
}

export const floatOut = async (session: Session, title: string) => {
  const view = hostById(session.host)

  if (!view) {
    return
  }

  await openWindow(
    keyOf(session),
    { host: session.host, id: session.id },
    title,
    label => {
      const tap = (event: HostEvent) => {
        if (concerns(event, session.id)) {
          emitTo(label, "float:event", event).catch(() => {})
        }
      }

      view.taps.add(tap)

      return () => view.taps.delete(tap)
    },
  )
}

const shareHosts = (label: string, keep: (event: HostEvent) => boolean) => {
  const emit = () => {
    emitTo(label, "float:hosts", hostEntries()).catch(e =>
      logFailure("float hosts", e),
    )
  }

  $effect(emit)

  const ready = getCurrentWebviewWindow().listen<string>(
    "float:ready",
    ({ payload }) => {
      if (payload === label) {
        emit()
      }
    },
  )

  tapHosts(label, keep)

  return () => {
    ready.then(f => f())
  }
}

export const floatNew = async (title: string) => {
  await openWindow(`new:${crypto.randomUUID()}`, { new: "1" }, title, label =>
    $effect.root(() => shareHosts(label, () => true)),
  )
}

export const serveWindow = (
  label: string,
  keep: (event: HostEvent) => boolean,
) => {
  serve()
  $effect.root(() => shareHosts(label, keep))
}

export const floatChat = async (id: string, title: string) => {
  const stored = chats.find(id)

  if (!stored) {
    return
  }

  const chat = chatFor(stored)

  await openWindow(id, { chat: id }, title, label =>
    $effect.root(() => {
      $effect(() => {
        emitTo(label, "float:chat", frameOf(chat)).catch(() => {})
      })
    }),
  )
}

export class RemoteChat implements ChatLike {
  messages = $state<ChatMessage[]>([])

  status = $state<ChatStatus>("ready")

  error = $state<Error | undefined>()

  ready: Promise<unknown>

  #id: string

  #stop: Promise<() => void>

  constructor(id: string) {
    this.#id = id
    this.#stop = getCurrentWebviewWindow().listen<ChatFrame>(
      "float:chat",
      ({ payload }) => {
        this.messages = payload.messages
        this.status = payload.status
        this.error = payload.error ? new Error(payload.error) : undefined
      },
    )
    this.ready = this.#stop.then(() => this.#call({ op: "sync" }))
  }

  sendMessage = (message: Outgoing) => this.#call({ op: "send", message })

  stop = () => this.#call({ op: "stop" })

  close = () => {
    this.#stop.then(f => f())
  }

  #call = (op: ChatOp) => {
    const call: ChatCall = {
      label: getCurrentWebviewWindow().label,
      id: this.#id,
      ...op,
    }

    return emitTo(MAIN, "float:chat-call", call)
  }
}

export const dock = async (key: string) => {
  const label = floating.get(key)

  if (label) {
    await (await WebviewWindow.getByLabel(label))?.close()
  }
}

export const remoteHost = (host: string, events = "float:event") => {
  const token = crypto.randomUUID()
  const win = getCurrentWebviewWindow()
  const waiting = new Map<number, (r: Reply) => void>()
  let seq = 0

  const call = async <K extends Op>(
    request: RequestOf<K>,
  ): Promise<Answers[K]> => {
    seq += 1

    const n = seq
    const result = await new Promise<Reply>(resolve => {
      waiting.set(n, resolve)
      emitTo(MAIN, "float:call", {
        label: win.label,
        seq: n,
        host,
        token,
        request,
      }).catch(e => resolve({ ok: false, error: String(e) }))
    })

    if (!result.ok) {
      throw new Error(result.error)
    }

    return result.value as Answers[K]
  }

  const view = new HostView(host, call)
  const stops = [
    win.listen<Reply & { seq: number; token: string }>(
      "float:reply",
      ({ payload }) => {
        if (payload.token !== token) {
          return
        }

        waiting.get(payload.seq)?.(reply.parse(payload))
        waiting.delete(payload.seq)
      },
    ),
    win.listen<HostEvent>(events, ({ payload }) => view.apply(payload)),
  ]

  return {
    view,
    ready: Promise.all(stops),
    stop: () => {
      for (const stop of stops) {
        stop.then(f => f())
      }

      for (const resolve of waiting.values()) {
        resolve({ ok: false, error: `host_closed: ${host}` })
      }

      waiting.clear()
    },
  }
}
