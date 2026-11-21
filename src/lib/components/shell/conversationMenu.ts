import { chats } from "#lib/chat/chats.svelte.ts"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import type { MenuItem } from "#lib/store/contextMenu.svelte.ts"
import { goPage, openConversation } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import type { Recent } from "#lib/store/recent.ts"
import type { AgentRow } from "#lib/store/spaceTree.ts"
import { markRead, unread } from "#lib/store/unread.svelte.ts"

const readItems = (item: Recent, row: AgentRow | null): MenuItem[] => {
  const host =
    item.current.kind === "session" ? hostById(item.current.host) : null

  if (row && host) {
    return row.status === "done"
      ? [
          {
            label: m.menu_mark_read(),
            icon: "lucide:check-check",
            run: () => host.seen(row.id, row.turn),
          },
        ]
      : row.turn > 0
        ? [
            {
              label: m.menu_mark_unread(),
              icon: "lucide:circle-dot",
              run: () => host.seen(row.id, row.turn - 1),
            },
          ]
        : []
  }

  return unread.has(item.key)
    ? [
        {
          label: m.menu_mark_read(),
          icon: "lucide:check-check",
          run: () => markRead(item.key),
        },
      ]
    : []
}

const removeItems = (item: Recent): MenuItem[] => {
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
    {
      label: m.menu_close_session(),
      icon: "lucide:circle-x",
      run: () => {
        panes.forget(current)

        return host.close(current.id)
      },
    },
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

  return [
    {
      label: m.menu_open(),
      icon: "lucide:square-arrow-out-up-right",
      run: () => openConversation(current),
    },
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
    {
      label: m.menu_copy_title(),
      icon: "lucide:type",
      run: () => navigator.clipboard.writeText(item.title),
    },
    {
      label: m.menu_copy_id(),
      icon: "lucide:fingerprint",
      run: () => navigator.clipboard.writeText(current.id),
    },
    ...removeItems(item),
  ]
}
