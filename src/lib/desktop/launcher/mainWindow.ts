import { invoke } from "@tauri-apps/api/core"
import { emitTo } from "@tauri-apps/api/event"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { drafts } from "#lib/chat/composer.svelte.ts"
import { knowledgeHost } from "#lib/knowledge/host.ts"
import { logFailure } from "#lib/logging.ts"
import { desktop } from "#lib/platform.ts"
import { goPage, nav, openConversation } from "#lib/store/nav.svelte.ts"
import { recents } from "#lib/store/recent.ts"
import {
  ATRIX_ITEMS,
  ATRIX_REQUEST,
  type AtrixItems,
  type AtrixRequest,
} from "./atrix.ts"

const START_DRAFT = "start"

const CONVERSATIONS = 200

const items = (): AtrixItems => ({
  conversations: recents()
    .slice(0, CONVERSATIONS)
    .map(r => ({
      key: r.key,
      current: r.current,
      title: r.title,
      source: r.source,
      icon: r.icon,
      running: r.running,
    })),
  docs: (knowledgeHost()?.knowledge ?? []).map(e => ({
    id: e.meta.id,
    title: e.meta.title,
    tags: e.meta.tags,
  })),
})

const surface = async () => {
  await getCurrentWebviewWindow().unminimize()
  await invoke("show_window", { label: "main" })
}

const focusComposer = () =>
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLTextAreaElement>(
        `[data-draft="${START_DRAFT}"] textarea`,
      )
      ?.focus(),
  )

const handle = async (request: AtrixRequest) => {
  if (request.kind === "list") {
    await emitTo(request.reply, ATRIX_ITEMS, items())

    return
  }

  await surface()

  if (request.kind === "new") {
    openConversation(null)
    drafts.set(START_DRAFT, request.prompt)
    focusComposer()
  } else if (request.kind === "conversation") {
    openConversation(request.current)
  } else if (request.kind === "doc") {
    nav.doc = request.id
    goPage("knowledge")
  }
}

if (desktop) {
  getCurrentWebviewWindow()
    .listen<AtrixRequest>(ATRIX_REQUEST, e => {
      handle(e.payload).catch(failure =>
        logFailure("launcher request", failure),
      )
    })
    .catch(failure => logFailure("launcher listen", failure))
}
