import { get, set } from "idb-keyval"
import { getContext, type Snippet, setContext } from "svelte"
import { SvelteMap, SvelteSet } from "svelte/reactivity"
import { z } from "zod"
import type { Command } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { openSettings } from "#lib/store/nav.svelte.ts"
import { Stored } from "#lib/store/stored.svelte.ts"
import { conversation } from "#lib/voice/conversation.svelte.ts"
import { voice } from "#lib/voice/voice.svelte.ts"
import { isImage } from "./attachments.ts"
import { expand, remember, type Suggestion } from "./mentions.ts"
import {
  clearQueue,
  drainFailures,
  enqueue,
  pending,
  queuedOf,
} from "./queue.svelte.ts"

export type ComposerProps = {
  busy: boolean
  running?: boolean
  draft: string
  queue?: boolean
  disabled?: boolean
  converse?: { host: string }
  placeholder: string
  commands?: Command[]
  people?: (query: string) => Suggestion[]
  datasources?: string[]
  tools?: Snippet
  side?: Snippet
  onSend: (text: string, files: File[]) => unknown
  onStop: () => void
  onCall?: () => void
}

const KEY = Symbol("composer")

export const drafts = new Stored("draft:", "", z.string())

const attached = new SvelteMap<string, File[]>()

const thumbnails = new SvelteMap<File, string>()

const restoring = new Set<string>()

const halted = new SvelteSet<string>()

const ATTACHED = "attached:"

const PASTE_CHARS = 1000

const PASTE_LINES = 10

const restore = (draft: string) => {
  if (restoring.has(draft)) {
    return
  }

  restoring.add(draft)
  get<File[]>(ATTACHED + draft)
    .then(files => {
      if (!files?.length || attached.has(draft)) {
        return
      }

      for (const file of files) {
        if (isImage(file)) {
          thumbnails.set(file, URL.createObjectURL(file))
        }
      }

      attached.set(draft, files)
    })
    .catch(() => {})
}

export const paneComposers = new Map<string, Composer>()

export class Composer {
  dropping = $state(false)

  picker = $state<HTMLInputElement>()

  previews = thumbnails

  #props: () => ComposerProps

  constructor(props: () => ComposerProps) {
    this.#props = props
  }

  get props() {
    return this.#props()
  }

  get files() {
    const { draft } = this.props

    restore(draft)

    return attached.get(draft) ?? []
  }

  set files(value: File[]) {
    const { draft } = this.props

    attached.set(draft, value)
    set(ATTACHED + draft, value).catch(() => {})
  }

  get callable() {
    return !!this.props.converse || !!this.props.onCall
  }

  get talking() {
    return conversation.owner === this.props.draft
  }

  call = () => {
    const { converse, draft } = this.props

    if (!voice.ready) {
      openSettings("gateway")
    } else if (converse) {
      conversation.start(draft, converse.host)
    } else {
      this.props.onCall?.()
    }
  }

  get text() {
    return drafts.get(this.props.draft)
  }

  set text(value: string) {
    drafts.set(this.props.draft, value)
  }

  get queued() {
    const { draft, queue } = this.props

    return queue ? queuedOf(draft) : []
  }

  get empty() {
    return !this.text.trim() && this.files.length === 0
  }

  get queueable() {
    const { busy, queue } = this.props

    return busy && !!queue
  }

  get stoppable() {
    const { busy, running } = this.props

    return (
      (busy && (this.empty || !this.queueable)) || (!!running && this.empty)
    )
  }

  add = (list: Iterable<File>) => {
    const added = [...list]

    for (const file of added) {
      if (isImage(file)) {
        this.previews.set(file, URL.createObjectURL(file))
      }
    }

    this.files = [...this.files, ...added]
  }

  paste = (text: string) => {
    const lines = text.split("\n").length

    if (text.length <= PASTE_CHARS && lines <= PASTE_LINES) {
      return false
    }

    const number = this.files.filter(f => !isImage(f)).length + 1
    const name = m.chat_pasted_text({ number, lines })

    this.add([new File([text], name, { type: "text/plain" })])

    return true
  }

  remove = (file: File) => {
    const url = this.previews.get(file)

    if (url) {
      URL.revokeObjectURL(url)
      this.previews.delete(file)
    }

    this.files = this.files.filter(f => f !== file)
  }

  mention = (suggestion: Suggestion) => remember(this.props.draft, suggestion)

  get stopped() {
    return halted.has(this.props.draft)
  }

  set stopped(value: boolean) {
    if (value) {
      halted.add(this.props.draft)
    } else {
      halted.delete(this.props.draft)
    }
  }

  #pullQueue = () => {
    const { draft } = this.props
    const queued = this.queued

    delete drainFailures[draft]

    if (queued.length === 0) {
      return false
    }

    clearQueue(draft)
    this.text = [...queued.map(q => q.text), this.text.trim()]
      .filter(Boolean)
      .join("\n\n")
    this.files = [...queued.flatMap(q => q.files), ...this.files]

    return true
  }

  recall = () => this.empty && this.#pullQueue()

  stop = () => {
    this.#pullQueue()
    this.stopped = true
    this.props.onStop()
  }

  submit = async () => {
    const { busy, disabled, draft, onSend } = this.props
    const value = this.text.trim()
    const files = this.files

    if (this.empty || disabled) {
      return
    }

    this.stopped = false

    const behind = !!this.props.queue && pending(draft)
    const queueing = busy || behind

    if (queueing && !this.props.queue) {
      return
    }

    this.text = ""
    this.files = []

    if (queueing) {
      enqueue(draft, value, files)
      delete drainFailures[draft]

      return
    }

    delete drainFailures[draft]

    const sending = await expand(draft, value)
    const sent = onSend(sending.text, [...files, ...sending.files])

    for (const file of files) {
      const url = this.previews.get(file)

      if (url) {
        URL.revokeObjectURL(url)
        this.previews.delete(file)
      }
    }

    Promise.resolve(sent).then(ok => {
      if (ok === false && !this.text) {
        this.text = value
      }
    })
  }
}

export const provideComposer = (composer: Composer) => setContext(KEY, composer)

export const useComposer = () => getContext<Composer>(KEY)
