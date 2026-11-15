import { native } from "#lib/native.ts"
import type { Answers, HostCall, OpenArgs } from "#lib/p2p/protocol.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import { type Draft, Postbox } from "./mail.ts"
import type { Harnesses } from "./registry.ts"
import { keep, kept } from "./saved.ts"
import type { Sessions } from "./sessions.ts"
import type { Message, Reachable } from "./tools.ts"

export type Remote = { id: string; name: string; call: HostCall }

export type Network = { self: () => string | null; remotes: () => Remote[] }

const SHORT = 8

const REMOTE_MS = 10_000

const remote = (id: string) => id.includes("@")

const normal = (text: string) => text.trim().toLowerCase()

const within = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("host_timeout")), ms),
    ),
  ])

const pick = <T>(
  all: T[],
  ref: string,
  idOf: (item: T) => string,
  titleOf: (item: T) => string,
) => {
  const byTitle = all.filter(item => normal(titleOf(item)) === normal(ref))

  return (
    all.find(item => idOf(item) === ref) ??
    (byTitle.length === 1 ? byTitle[0] : null)
  )
}

export class Mailroom {
  #postbox = new Postbox(
    id => !remote(id) && this.sessions.busy(id),
    (id, text) =>
      remote(id) ? this.#forward(id, text) : this.sessions.prompt(id, text, []),
    id => (remote(id) ? null : this.#overCap(id)),
  )

  constructor(
    private readonly sessions: Sessions,
    private readonly harnesses: Harnesses,
    private readonly network: () => Network | null,
  ) {}

  notice = (to: string, text: string, expires?: boolean) =>
    this.#postbox.notice(to, text, expires)

  drain = (sessionId: string) => this.#postbox.drain(sessionId)

  closed = (sessionId: string) =>
    this.#postbox.fail(
      sessionId,
      `session_closed: ${sessionId} was closed before the message arrived`,
    )

  everywhere = async (caller: string): Promise<Reachable[]> => [
    ...this.sessions
      .reachable()
      .filter(s => s.id !== caller)
      .map(s => ({ ...s, host: settings.deviceName })),
    ...(await this.#remoteSessions()),
  ]

  send = async (from: string, { to, text, thread, refs = [] }: Message) => {
    const sender =
      this.sessions.reachable().find(s => s.id === from)?.title ?? from
    const { session, remote: target } = this.#route(to)

    if (target) {
      return target.call({
        op: "mail.post",
        letter: {
          from: this.#qualify(from),
          sender: `${sender} (${settings.deviceName})`,
          to: session,
          thread,
          refs,
          text,
        },
      })
    }

    return this.post({ from, sender, to: session, thread, refs, text })
  }

  post = async ({ from, sender, to, thread, refs, text }: Draft) => {
    const target = pick(
      this.sessions.reachable(),
      to,
      s => s.id,
      s => s.title,
    )

    if (!target) {
      throw new Error(
        `unknown_session: no single session matches "${to}"; call list_sessions`,
      )
    }

    if (target.id === from) {
      throw new Error("self_message: a session cannot message itself")
    }

    return this.#postbox.post({
      from,
      sender,
      to: target.id,
      thread,
      refs,
      text,
    })
  }

  openWorker = async (
    caller: string,
    { host, ...args }: OpenArgs,
  ): Promise<Answers["mail.open"]> => {
    const target = host ? this.#route(`@${host}`).remote : null

    if (target) {
      const opened = await target.call({
        op: "mail.open",
        caller: this.#qualify(caller),
        args,
      })

      return { ...opened, id: `${opened.id}@${target.id.slice(0, SHORT)}` }
    }

    const { harness, cwd, title, profile } = args

    await native("browse_dirs", { path: cwd }).catch(() => {
      throw new Error(`missing_cwd: ${cwd} is not an existing folder`)
    })

    const all = this.harnesses.all()
    const entry = all.find(
      h =>
        h.id === harness ||
        (h.base === harness && h.profile === (profile ?? null)),
    )

    if (!entry) {
      const known = all.map(h =>
        h.profile ? `${h.base} (profile ${h.profile})` : h.id,
      )

      throw new Error(
        `unknown_harness: "${harness}" is not available; use one of ${known.join(", ")}`,
      )
    }

    const same = (s: { title: string; cwd: string }) =>
      normal(s.title) === normal(title) && s.cwd === cwd
    const open = this.sessions.open().find(same)

    if (open?.id === caller) {
      throw new Error("self_open: this is the calling session")
    }

    if (open) {
      return { id: open.id, title: open.title, reopened: true }
    }

    const saved = kept().find(k => k.harness === entry.id && same(k))
    const view = saved
      ? await this.sessions.load(entry.id, saved.sessionId, cwd, saved.title)
      : await this.sessions.create(entry.id, cwd)

    keep({
      harness: entry.id,
      sessionId: view.id,
      cwd,
      title,
      named: true,
    })
    this.sessions.retitle(view.id, title)

    return { id: view.id, title, reopened: !!saved }
  }

  closeWorker = async (
    caller: string,
    ref: string,
  ): Promise<Answers["mail.close"]> => {
    const { session, remote: away } = this.#route(ref)

    if (away) {
      return away.call({
        op: "mail.close",
        caller: this.#qualify(caller),
        session,
      })
    }

    if (session === caller) {
      throw new Error("self_close: a session cannot close itself")
    }

    const target = pick(
      kept().filter(k => k.named),
      session,
      k => k.sessionId,
      k => k.title,
    )

    if (!target) {
      throw new Error(
        `unknown_worker: no single session opened with open_session matches "${session}"`,
      )
    }

    if (target.sessionId === caller) {
      throw new Error("self_close: a session cannot close itself")
    }

    await this.sessions.close(target.sessionId)

    return { closed: target.sessionId, title: target.title }
  }

  #overCap = (sessionId: string) => {
    const cap = settings.mailTokenCap
    const used = this.sessions.tokens(sessionId)

    return cap > 0 && used > cap
      ? `token_cap: session ${sessionId} has used ${used} tokens, over the ${cap} token cap for messages from other sessions; the user can change it in Settings > Harnesses > Messages between sessions`
      : null
  }

  #qualify = (id: string) =>
    `${id}@${(this.network()?.self() ?? "").slice(0, SHORT)}`

  #route = (ref: string) => {
    const at = ref.lastIndexOf("@")

    if (at < 0) {
      return { session: ref, remote: null }
    }

    const session = ref.slice(0, at)
    const host = normal(ref.slice(at + 1))
    const self = this.network()?.self() ?? ""
    const local =
      host === normal(settings.deviceName) ||
      (host.length >= 4 && self.startsWith(host))

    if (local) {
      return { session, remote: null }
    }

    const hits = (this.network()?.remotes() ?? []).filter(
      r =>
        (host.length >= 4 && r.id.startsWith(host)) || normal(r.name) === host,
    )

    if (hits.length !== 1) {
      throw new Error(
        `unknown_host: no single online Atrix device matches "${host}"; call list_sessions`,
      )
    }

    return { session, remote: hits[0] }
  }

  #remoteSessions = async (): Promise<Reachable[]> => {
    const lists = await Promise.all(
      (this.network()?.remotes() ?? []).map(async r => {
        const listed = await within(
          r.call({ op: "mail.sessions" }),
          REMOTE_MS,
        ).catch((): Reachable[] => [])

        return listed.map(s => ({
          ...s,
          id: `${s.id}@${r.id.slice(0, SHORT)}`,
          host: r.name,
        }))
      }),
    )

    return lists.flat()
  }

  #forward = async (id: string, text: string) => {
    const { session, remote: target } = this.#route(id)

    if (!target) {
      return this.sessions.prompt(session, text, [])
    }

    return target.call({ op: "mail.notice", to: session, text })
  }
}
