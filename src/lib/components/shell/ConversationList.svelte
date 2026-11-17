<script lang="ts">
import Icon from "@iconify/svelte"
import { chats } from "#lib/chat/chats.svelte.ts"
import { groups } from "#lib/chat/groups.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { tooltip } from "#lib/components/ui/tooltip.ts"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { contextMenu, type MenuItem } from "#lib/store/contextMenu.svelte.ts"
import { startDrag } from "#lib/store/drag.ts"
import { keyOf } from "#lib/store/keys.ts"
import { goPage, openConversation } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import { type Recent, recents } from "#lib/store/recent.ts"
import { sessionFilter } from "#lib/store/sessionFilter.svelte.ts"
import { markRead, unread } from "#lib/store/unread.svelte.ts"

let { rail = false }: { rail?: boolean } = $props()

const detailOf = (item: Recent) => [
  item.title,
  item.source,
  ...(item.at > 0 && item.at <= Date.now()
    ? [m.shell_last_active({ when: ago(item.at) })]
    : []),
  statusOf(item),
]

const ago = (at: number) => {
  const minutes = Math.round((Date.now() - at) / 60000)
  const format = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" })

  if (minutes < 60) {
    return format.format(-minutes, "minute")
  }

  if (minutes < 60 * 24) {
    return format.format(-Math.round(minutes / 60), "hour")
  }

  return format.format(-Math.round(minutes / 60 / 24), "day")
}

const all = $derived(recents())

const items = $derived(sessionFilter.apply(all))

let frozen = $state.raw<Map<string, number> | null>(null)

const shown = $derived(
  frozen
    ? items.toSorted(
        (a, b) =>
          (frozen?.get(a.key) ?? Number.POSITIVE_INFINITY) -
          (frozen?.get(b.key) ?? Number.POSITIVE_INFINITY),
      )
    : items,
)

const freeze = () => {
  frozen = new Map(items.map((item, i) => [item.key, i]))
}

const thaw = () => {
  frozen = null
}

const activeKey = $derived(
  panes.active.current ? keyOf(panes.active.current) : null,
)

const openKeys = $derived(
  new Set(panes.leaves.flatMap(l => (l.current ? [keyOf(l.current)] : []))),
)

const statusOf = (item: Recent) => {
  if (item.running) {
    return m.session_running()
  }

  if (unread.has(item.key)) {
    return m.session_unread()
  }

  return item.live ? m.session_active() : m.session_inactive()
}

const menuFor = (item: Recent): MenuItem[] => {
  const current = item.current
  const host = current.kind === "session" ? hostById(current.host) : null
  const isOpen =
    current.kind === "session" &&
    !!host?.state?.open.some(s => s.id === current.id)
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
    ...(unread.has(item.key)
      ? [
          {
            label: m.menu_mark_read(),
            icon: "lucide:check-check",
            run: () => markRead(item.key),
          },
        ]
      : []),
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
    ...(current.kind === "session"
      ? [
          "separator" as const,
          {
            label: m.group_start_with(),
            icon: "lucide:users",
            run: async () => {
              const id = await groups.create()

              await groups.join(id, current.host, current.id)
              openConversation({ kind: "group", id })
            },
          },
          ...groups.list.map(g => ({
            label: m.group_add_to({ name: g.title }),
            icon: "lucide:user-plus",
            run: () => groups.join(g.id, current.host, current.id),
          })),
        ]
      : []),
    ...(current.kind === "group"
      ? [
          "separator" as const,
          {
            label: m.group_delete(),
            icon: "lucide:trash-2",
            danger: true,
            confirm: m.menu_confirm_delete(),
            run: () => groups.remove(current.id),
          },
        ]
      : current.kind === "chat"
      ? [
          "separator" as const,
          {
            label: m.menu_delete_chat(),
            icon: "lucide:trash-2",
            danger: true,
            confirm: m.menu_confirm_delete(),
            run: () => chats.remove(current.id),
          },
        ]
      : isOpen && host
        ? [
            "separator" as const,
            {
              label: m.menu_close_session(),
              icon: "lucide:circle-x",
              run: () => host.close(current.id),
            },
          ]
        : []),
  ]
}
</script>

<ul
  class={["menu w-full gap-0.5 pt-0", rail ? "items-center px-1" : "ps-2 pe-1"]}
  onpointerenter={freeze}
  onpointerleave={thaw}
>
  {#each shown as item (item.key)}
    {@const fresh = unread.has(item.key)}
    <li>
      <button
        type="button"
        class={[
          "min-w-0 cursor-grab active:cursor-grabbing",
          rail ? "size-8 content-center justify-center p-0" : "gap-2 pe-1.5",
          activeKey === item.key && "menu-active",
        ]}
        title={rail ? undefined : `${item.source}. ${statusOf(item)}`}
        aria-label={item.title}
        {@attach tooltip(() => detailOf(item), () => rail)}
        draggable="true"
        ondragstart={e => startDrag(e, item.current)}
        onclick={() => openConversation(item.current)}
        oncontextmenu={e => contextMenu.show(e, menuFor(item))}
      >
        <Icon
          icon={item.icon}
          class={[
            "size-4 shrink-0",
            item.live ? "opacity-80" : "opacity-40",
            rail && (item.running || fresh) && "text-primary opacity-100",
            rail && item.running && "animate-breathe",
          ]}
        />
        {#if !rail}
        <span
          class={[
            "min-w-0 flex-1 truncate",
            !item.live && "text-base-content/50",
            fresh && "font-semibold text-base-content",
          ]}
        >
          {item.title}
        </span>
        {#if openKeys.has(item.key) && activeKey !== item.key}
          <Icon
            icon="lucide:panel-right"
            class="size-4 shrink-0 opacity-50"
            aria-label={m.chat_open_elsewhere()}
          />
        {/if}
        <span
          class="grid size-4 shrink-0 place-items-center"
          role="img"
          aria-label={statusOf(item)}
        >
          {#if item.running}
            <span class="loading loading-spinner loading-xs text-primary"></span>
          {:else if fresh}
            <span class="size-2 rounded-full bg-primary"></span>
          {:else if item.live && item.current.kind === "session"}
            <span class="size-1.5 rounded-full bg-success/70"></span>
          {/if}
        </span>
        {/if}
      </button>
    </li>
  {/each}
</ul>
{#if items.length === 0 && !rail}
  <EmptyState
    icon="lucide:inbox"
    text={all.length ? m.filter_empty() : m.chat_none()}
    class="py-6"
  />
{/if}
