const THREAD_LIMIT = 20

const TTL_MS = 10 * 60_000

export type Letter = {
  from: string
  sender: string
  to: string
  thread: string
  refs: string[]
  text: string
  expires: number
  raw?: boolean
}

export type Draft = Omit<Letter, "thread" | "expires"> & { thread?: string }

const attr = (value: string) => value.replaceAll('"', "'")

export const letterText = (l: Letter) =>
  [
    `<atrix-message from="${attr(l.sender)}" from-id="${l.from}" thread="${l.thread}" refs="${l.refs.join(",")}">`,
    l.text,
    "</atrix-message>",
  ].join("\n")

export class Postbox {
  #queues = new Map<string, Letter[]>()

  #threads = new Map<string, number>()

  constructor(
    private readonly busy: (sessionId: string) => boolean,
    private readonly deliver: (
      sessionId: string,
      text: string,
    ) => Promise<unknown>,
  ) {}

  post = async ({ thread = crypto.randomUUID(), ...draft }: Draft) => {
    const count = (this.#threads.get(thread) ?? 0) + 1

    if (count > THREAD_LIMIT) {
      throw new Error(
        `thread_limit: thread ${thread} reached ${THREAD_LIMIT} messages`,
      )
    }

    this.#threads.set(thread, count)

    const letter: Letter = { ...draft, thread, expires: Date.now() + TTL_MS }

    if (this.busy(letter.to)) {
      this.#queues.set(letter.to, [
        ...(this.#queues.get(letter.to) ?? []),
        letter,
      ])

      return { thread, queued: true }
    }

    await this.deliver(letter.to, letterText(letter))

    return { thread, queued: false }
  }

  notice = async (to: string, text: string) => {
    const letter: Letter = {
      from: "atrix",
      sender: "atrix",
      to,
      thread: "",
      refs: [],
      text,
      expires: Date.now() + TTL_MS,
      raw: true,
    }

    const queue = this.#queues.get(to) ?? []

    if (queue.some(l => l.raw && l.text === text)) {
      return
    }

    if (this.busy(to)) {
      this.#queues.set(to, [...queue, letter])
    } else {
      await this.deliver(to, text)
    }
  }

  drain = async (sessionId: string) => {
    const queue = this.#queues.get(sessionId) ?? []

    for (let next = queue.shift(); next; next = queue.shift()) {
      if (next.expires > Date.now()) {
        await this.deliver(sessionId, next.raw ? next.text : letterText(next))

        return
      }
    }
  }
}
