import { getContext, type Snippet, setContext } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { z } from "zod"
import type { Command } from "#lib/p2p/protocol.ts"
import { Stored } from "#lib/store/stored.svelte.ts"
import { isImage } from "./attachments.ts"
import { drainFailures, enqueue, pending, queues } from "./queue.svelte.ts"

export type ComposerProps = {
  busy: boolean
  draft: string
  queue?: boolean
  disabled?: boolean
  converse?: { host: string }
  placeholder: string
  commands?: Command[]
  datasources?: string[]
  tools?: Snippet
  side?: Snippet
  onSend: (text: string, files: File[]) => unknown
  onStop: () => void
}

const KEY = Symbol("composer")

export const drafts = new Stored("draft:", "", z.string())

export class Composer {
  files = $state<File[]>([])

  dropping = $state(false)

  picker = $state<HTMLInputElement>()

  previews = new SvelteMap<File, string>()

  #props: () => ComposerProps

  constructor(props: () => ComposerProps) {
    this.#props = props
  }

  get props() {
    return this.#props()
  }

  get text() {
    return drafts.get(this.props.draft)
  }

  set text(value: string) {
    drafts.set(this.props.draft, value)
  }

  get queued() {
    const { draft, queue } = this.props

    return queue ? queues.get(draft) : []
  }

  get empty() {
    return !this.text.trim() && this.files.length === 0
  }

  get blocked() {
    const { busy, draft, queue } = this.props

    return !!queue && !busy && pending(draft) && this.files.length > 0
  }

  get queueable() {
    const { busy, queue } = this.props

    return busy && !!queue && this.files.length === 0
  }

  get stoppable() {
    return this.props.busy && (this.empty || !this.queueable)
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

  remove = (file: File) => {
    const url = this.previews.get(file)

    if (url) {
      URL.revokeObjectURL(url)
      this.previews.delete(file)
    }

    this.files = this.files.filter(f => f !== file)
  }

  stop = () => {
    const { draft, onStop } = this.props
    const queued = this.queued

    delete drainFailures[draft]

    if (queued.length > 0) {
      this.text = [...queued, this.text.trim()].filter(Boolean).join("\n\n")
      queues.set(draft, [])
    }

    onStop()
  }

  submit = () => {
    const { busy, disabled, draft, onSend } = this.props
    const value = this.text.trim()

    if (this.empty || disabled) {
      return
    }

    const behind = !!this.props.queue && pending(draft)

    if (busy || behind) {
      if (this.props.queue && this.files.length === 0) {
        enqueue(draft, value)
        this.text = ""
        delete drainFailures[draft]
      }

      return
    }

    delete drainFailures[draft]

    const sent = onSend(value, this.files)

    for (const file of this.files) {
      this.remove(file)
    }

    this.text = ""

    Promise.resolve(sent).then(ok => {
      if (ok === false && !this.text) {
        this.text = value
      }
    })
  }
}

export const provideComposer = (composer: Composer) => setContext(KEY, composer)

export const useComposer = () => getContext<Composer>(KEY)
