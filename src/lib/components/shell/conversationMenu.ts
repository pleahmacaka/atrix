import { chats } from "#lib/chat/chats.svelte.ts"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import type { MenuItem } from "#lib/store/contextMenu.svelte.ts"
import { goPage, openConversation } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import type { Recent } from "#lib/store/recent.ts"
import type { AgentRow } from "#lib/store/spaceTree.ts"
import { markRead, unread } from "#lib/store/unread.svelte.ts"

const markItem = (
  label: string,
  icon: string,
  run: () => unknown,
): MenuItem => ({
  label,
  icon,
  run,
})

const readItems = (item: Recent, row: AgentRow | null): MenuItem[] => {
  const current = item.current
  const host = current.kind === "session" ? hostById(current.host) : null

  if (row && host) {
    if (row.status === "done") {
      return [
        markItem(m.menu_mark_read(), "lucide:check-check", () =>
          host.seen(row.id, row.turn),
        ),
      ]
    }

    return row.turn > 0
      ? [
          markItem(m.menu_mark_unread(), "lucide:circle-dot", () =>
            host.seen(row.id, row.turn - 1),
          ),
        ]
      : []
  }

  return unread.has(item.key)
    ? [
        markItem(m.menu_mark_read(), "lucide:check-check", () =>
          markRead(item.key),
        ),
      ]
    : []
}

const closeItems = (item: Recent): MenuItem[] => {
  const current = item.current

  if (current.kind === "chat") {
    return [
      "separator",
      {
        label: m.menu_delete_chat(),
        icon: "lucide:trash-2",
        danger: true,
        confirm: m.menu_confirm_delete(),
        run: () => chats.remove(current.id),
      },
    ]
  }

  const host = hostById(current.host)

  if (!host?.state?.open.some(s => s.id === current.id)) {
    return []
  }

  return [
    "separator",
    markItem(m.menu_close_session(), "lucide:circle-x", () => {
      panes.forget(current)

      return host.close(current.id)
    }),
  ]
}

export const conversationMenu = (
  item: Recent,
  row: AgentRow | null,
): MenuItem[] => {
  const current = item.current
  const split = (side: "right" | "bottom") => {
    goPage("chat")
    panes.split(panes.active.id, side, current)
  }
  const copy = (text: string) => navigator.clipboard.writeText(text)

  return [
    markItem(m.menu_open(), "lucide:square-arrow-out-up-right", () =>
      openConversation(current),
    ),
    {
      label: m.menu_open_right(),
      icon: "lucide:columns-2",
      disabled: !panes.canSplit(panes.active.id, "right"),
      run: () => split("right"),
    },
    {
      label: m.menu_open_below(),
      icon: "lucide:rows-2",
      disabled: !panes.canSplit(panes.active.id, "bottom"),
      run: () => split("bottom"),
    },
    ...readItems(item, row),
    "separator",
    markItem(m.menu_copy_title(), "lucide:type", () => copy(item.title)),
    markItem(m.menu_copy_id(), "lucide:fingerprint", () => copy(current.id)),
    ...closeItems(item),
  ]
}
