import { isBusyError } from "#lib/p2p/protocol.ts"

const THREAD_LIMIT = 20

const THREAD_WINDOW_MS = 10 * 60_000

const NOTICE_TTL_MS = 10 * 60_000

export type Letter = {
  from: string
  sender: string
  to: string
  thread: string
  refs: string[]
  text: string
  expires?: number
  raw?: boolean
}

export type Draft = Omit<Letter, "thread" | "expires"> & { thread?: string }

const attr = (value: string) => value.replaceAll('"', "'")

const letterText = (l: Letter) =>
  [
    `<atrix-message from="${attr(l.sender)}" from-id="${l.from}" thread="${l.thread}" refs="${l.refs.join(",")}">`,
    l.text,
    "</atrix-message>",
  ].join("\n")

const failureText = (l: Letter, reason: string) =>
  `<atrix-message-failed to-id="${l.to}" thread="${l.thread}">${reason}</atrix-message-failed>`

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

export class Postbox {
  #queues = new Map<string, Letter[]>()

  #threads = new Map<string, number[]>()

  constructor(
    private readonly busy: (sessionId: string) => boolean,
    private readonly deliver: (
      sessionId: string,
      text: string,
    ) => Promise<unknown>,
    private readonly refuse: (sessionId: string) => string | null = () => null,
  ) {}

  post = async ({ thread = crypto.randomUUID(), ...draft }: Draft) => {
    const now = Date.now()
    const recent = (this.#threads.get(thread) ?? []).filter(
      t => t > now - THREAD_WINDOW_MS,
    )

    if (recent.length >= THREAD_LIMIT) {
      throw new Error(
        `thread_limit: thread ${thread} sent ${THREAD_LIMIT} messages in the last ${THREAD_WINDOW_MS / 60_000} minutes; wait or start a new thread`,
      )
    }

    const refused = this.refuse(draft.to)

    if (refused) {
      throw new Error(refused)
    }

    this.#threads.set(thread, [...recent, now])

    const letter: Letter = { ...draft, thread }

    const queued = await this.#send(letter, letterText(letter))

    return { thread, queued }
  }

  notice = async (to: string, text: string, expires = true) => {
    const letter: Letter = {
      from: "atrix",
      sender: "atrix",
      to,
      thread: "",
      refs: [],
      text,
      expires: expires ? Date.now() + NOTICE_TTL_MS : undefined,
      raw: true,
    }

    const queue = this.#queues.get(to) ?? []

    if (queue.some(l => l.raw && l.text === text)) {
      return
    }

    await this.#send(letter, text)
  }

  drain = async (sessionId: string) => {
    const queue = this.#queues.get(sessionId) ?? []

    for (let next = queue.shift(); next; next = queue.shift()) {
      if (next.raw) {
        if (next.expires === undefined || next.expires > Date.now()) {
          try {
            await this.deliver(sessionId, next.text)
          } catch (e) {
            if (isBusyError(e)) {
              queue.unshift(next)
            }
          }

          return
        }

        continue
      }

      const refused = this.refuse(sessionId)

      if (refused) {
        this.#bounce(next, refused)

        continue
      }

      try {
        await this.deliver(sessionId, letterText(next))

        return
      } catch (e) {
        if (isBusyError(e)) {
          queue.unshift(next)

          return
        }

        this.#bounce(next, reasonOf(e))
      }
    }
  }

  fail = (sessionId: string, reason: string) => {
    const queue = this.#queues.get(sessionId) ?? []

    this.#queues.delete(sessionId)

    for (const letter of queue) {
      if (!letter.raw) {
        this.#bounce(letter, reason)
      }
    }
  }

  #send = async (letter: Letter, text: string) => {
    if (!this.busy(letter.to)) {
      try {
        await this.deliver(letter.to, text)

        return false
      } catch (e) {
        if (!isBusyError(e)) {
          throw e
        }
      }
    }

    const queue = this.#queues.get(letter.to) ?? []

    queue.push(letter)
    this.#queues.set(letter.to, queue)

    return true
  }

  #bounce = (letter: Letter, reason: string) => {
    if (letter.from === "atrix" || letter.from === letter.to) {
      return
    }

    this.notice(letter.from, failureText(letter, reason), false).catch(() => {})
  }
}
