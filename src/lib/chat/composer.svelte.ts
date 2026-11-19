import { getContext, type Snippet, setContext } from "svelte"
import { z } from "zod"
import type { Command } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { openSettings } from "#lib/store/nav.svelte.ts"
import { Stored } from "#lib/store/stored.svelte.ts"
import { conversation } from "#lib/voice/conversation.svelte.ts"
import { voice } from "#lib/voice/voice.svelte.ts"
import { isImage } from "./attachments.ts"
import {
  addFiles,
  filesOf,
  previewsOf,
  release,
  removeFile,
  replaceFile,
  setFiles,
} from "./composer/files.ts"
import { clearQuote, quoted, quoteOf, setQuote } from "./composer/quote.ts"
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
  onRecall?: () => Promise<string[]>
  extras?: Snippet
  side?: Snippet
  onSend: (text: string, files: File[]) => unknown
  onStop: () => void
  onCall?: () => void
}

const KEY = Symbol("composer")

export const drafts = new Stored("draft:", "", z.string())

export { clearQuote, quoted, quoteOf }

const PASTE_CHARS = 1000

const PASTE_LINES = 10

const halted = new Set<string>()

export const paneComposers = new Map<string, Composer>()

export class Composer {
  dropping = $state(false)

  floating = $state(false)

  picker = $state<HTMLInputElement>()

  previews = previewsOf

  #props: () => ComposerProps

  constructor(props: () => ComposerProps) {
    this.#props = props
  }

  get props() {
    return this.#props()
  }

  get files() {
    return filesOf(this.props.draft)
  }

  set files(value: File[]) {
    setFiles(this.props.draft, value)
  }

  get callable() {
    return !!this.props.converse || !!this.props.onCall
  }

  get talking() {
    return conversation.owner === this.props.draft
  }

  get text() {
    return drafts.get(this.props.draft)
  }

  set text(value: string) {
    drafts.set(this.props.draft, value)
  }

  get quote() {
    return quoteOf(this.props.draft)
  }

  get queued() {
    return this.props.queue ? queuedOf(this.props.draft) : []
  }

  get empty() {
    return !this.text.trim() && this.files.length === 0
  }

  get queueable() {
    return this.props.busy && !!this.props.queue
  }

  get stoppable() {
    const { busy, running } = this.props

    return (
      (busy && (this.empty || !this.queueable)) || (!!running && this.empty)
    )
  }

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

  call = () => {
    const { converse, draft, onCall } = this.props

    if (!voice.ready) {
      openSettings("gateway")
    } else if (converse) {
      conversation.start(draft, converse.host)
    } else {
      onCall?.()
    }
  }

  add = (list: Iterable<File>) => addFiles(this.props.draft, list)

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

  replace = (file: File, next: File) =>
    replaceFile(this.props.draft, file, next)

  remove = (file: File) => removeFile(this.props.draft, file)

  mention = (suggestion: Suggestion) => remember(this.props.draft, suggestion)

  clearQuote = () => clearQuote(this.props.draft)

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
    const quote = this.quote
    const typed = this.text.trim()
    const value = quote ? `${quoted(quote)}\n\n${typed}` : typed
    const files = this.files

    if (this.empty || disabled) {
      return
    }

    this.stopped = false

    const queueing = busy || (!!this.props.queue && pending(draft))

    if (queueing && !this.props.queue) {
      return
    }

    this.text = ""
    this.files = []
    this.clearQuote()
    delete drainFailures[draft]

    if (queueing) {
      enqueue(draft, value, files)

      return
    }

    const sending = await expand(draft, value)
    const sent = onSend(sending.text, [...files, ...sending.files])

    files.forEach(release)

    Promise.resolve(sent).then(ok => {
      if (ok === false && !this.text) {
        this.text = typed

        if (quote) {
          setQuote(draft, quote)
        }
      }
    })
  }
}

export const provideComposer = (composer: Composer) => {
  setContext(KEY, composer)

  return composer
}

export const useComposer = () => getContext<Composer>(KEY)
