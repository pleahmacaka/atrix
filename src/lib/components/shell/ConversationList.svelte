<script lang="ts">
import Icon from "@iconify/svelte"
import { chats } from "#lib/chat/chats.svelte.ts"
import { brandIcon } from "#lib/components/harness/brands.ts"
import { hostById, hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu, type MenuItem } from "#lib/store/contextMenu.svelte.ts"
import { startDrag } from "#lib/store/drag.ts"
import { keyOf } from "#lib/store/keys.ts"
import { nav, openConversation } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import { type Recent, recents } from "#lib/store/recent.ts"
import {
  type KindFilter,
  type SortKey,
  type StatusFilter,
  sessionFilter,
} from "#lib/store/sessionFilter.svelte.ts"
import { markRead, unread } from "#lib/store/unread.svelte.ts"

const uid = $props.id()

const all = $derived(recents())

const items = $derived(sessionFilter.apply(all))

const activeKey = $derived(
  panes.active.current ? keyOf(panes.active.current) : null,
)

const openKeys = $derived(
  new Set(panes.leaves.flatMap(l => (l.current ? [keyOf(l.current)] : []))),
)

const harnesses = $derived(
  hostList().flatMap(h =>
    (h.view.state?.harnesses ?? [])
      .filter(x => x.enabled)
      .map(x => ({ id: x.id, name: x.name, base: x.base })),
  ),
)

const KINDS: { id: KindFilter; label: () => string }[] = [
  { id: "all", label: m.filter_all },
  { id: "chat", label: m.filter_chats },
  { id: "session", label: m.filter_sessions },
]

const STATUSES: { id: StatusFilter; label: () => string; icon: string }[] = [
  { id: "all", label: m.filter_all, icon: "lucide:circle-dashed" },
  { id: "running", label: m.filter_running, icon: "lucide:loader" },
  { id: "unread", label: m.filter_unread, icon: "lucide:circle-dot" },
  { id: "open", label: m.filter_open, icon: "lucide:circle-check" },
]

const SORTS: { id: SortKey; label: () => string; icon: string }[] = [
  { id: "activity", label: m.sort_activity, icon: "lucide:clock" },
  { id: "title", label: m.sort_title_name, icon: "lucide:arrow-down-a-z" },
  { id: "status", label: m.sort_status, icon: "lucide:activity" },
]

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
    nav.page = "chat"
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
      run: () => split("right"),
    },
    {
      label: m.menu_open_below(),
      icon: "lucide:rows-2",
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
    ...(current.kind === "chat"
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

{#snippet choice(selected: boolean, label: string, icon: string, pick: () => void)}
  <button
    type="button"
    class={[
      "flex min-h-8 cursor-pointer items-center gap-2 rounded-field px-2 text-left",
      "hover:bg-base-content/10",
      selected && "text-primary",
    ]}
    aria-pressed={selected}
    onclick={pick}
  >
    <Icon {icon} class="size-4 shrink-0 opacity-70" />
    <span class="min-w-0 flex-1 truncate">{label}</span>
    <Icon icon="lucide:check" class={["size-4 shrink-0", !selected && "invisible"]} />
  </button>
{/snippet}

<ul class="menu w-full gap-0.5 px-2 py-1">
  <li>
    <button type="button" onclick={() => openConversation(null)}>
      <Icon icon="lucide:square-pen" class="size-4" />
      <span class="flex-1">{m.chat_new()}</span>
      <kbd class="kbd kbd-xs opacity-60">Ctrl N</kbd>
    </button>
  </li>
  <li>
    <button
      type="button"
      onclick={() => {
        nav.palette = true
      }}
    >
      <Icon icon="lucide:search" class="size-4" />
      <span class="flex-1">{m.chat_search_load()}</span>
      <kbd class="kbd kbd-xs opacity-60">Ctrl K</kbd>
    </button>
  </li>
</ul>

<div class="flex items-center gap-0.5 ps-6 pe-3 pt-2 pb-1">
  <span class="flex-1 text-xs text-base-content/50">{m.sessions_title()}</span>
  <button
    type="button"
    class={["btn btn-ghost btn-xs btn-square relative", sessionFilter.active && "text-primary"]}
    aria-label={m.filter_title()}
    title={m.filter_title()}
    popovertarget="{uid}-filter"
    style:anchor-name="--{uid}-filter"
  >
    <Icon icon="lucide:list-filter" class="size-3.5" />
    {#if sessionFilter.active}
      <span class="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary"></span>
    {/if}
  </button>
  <button
    type="button"
    class="btn btn-ghost btn-xs btn-square"
    aria-label={m.sort_title()}
    title={m.sort_title()}
    popovertarget="{uid}-sort"
    style:anchor-name="--{uid}-sort"
  >
    <Icon icon="lucide:arrow-up-down" class="size-3.5" />
  </button>
</div>

<div
  id="{uid}-filter"
  popover="auto"
  style:position-anchor="--{uid}-filter"
  class={[
    "anchored popover-box fixed inset-auto m-0 my-1 hidden w-60 flex-col gap-1 p-1",
    "text-sm text-base-content open:flex",
  ]}
>
  <p class="px-2 pt-1 text-xs text-base-content/50">{m.filter_kind()}</p>
  {#each KINDS as kind (kind.id)}
    {@render choice(
      sessionFilter.value.kind === kind.id,
      kind.label(),
      kind.id === "chat"
        ? "lucide:message-square"
        : kind.id === "session"
          ? "lucide:terminal"
          : "lucide:layers",
      () => sessionFilter.set({ kind: kind.id }),
    )}
  {/each}
  <hr class="my-1 border-base-content/10" />
  <p class="px-2 text-xs text-base-content/50">{m.filter_status()}</p>
  {#each STATUSES as status (status.id)}
    {@render choice(
      sessionFilter.value.status === status.id,
      status.label(),
      status.icon,
      () => sessionFilter.set({ status: status.id }),
    )}
  {/each}
  {#if harnesses.length}
    <hr class="my-1 border-base-content/10" />
    <p class="px-2 text-xs text-base-content/50">{m.filter_harness()}</p>
    <div class="flex flex-wrap gap-1 px-1 pb-1">
      {#each harnesses as h (h.id)}
        <button
          type="button"
          class={[
            "btn btn-xs btn-square",
            sessionFilter.value.harness === h.id ? "btn-primary" : "btn-ghost",
          ]}
          aria-label={h.name}
          title={h.name}
          aria-pressed={sessionFilter.value.harness === h.id}
          onclick={() =>
            sessionFilter.set({
              harness: sessionFilter.value.harness === h.id ? null : h.id,
            })}
        >
          <Icon icon={brandIcon(h.base)} class="size-4" />
        </button>
      {/each}
    </div>
  {/if}
  {#if sessionFilter.active}
    <hr class="my-1 border-base-content/10" />
    <button
      type="button"
      class="flex min-h-8 cursor-pointer items-center gap-2 rounded-field px-2 hover:bg-base-content/10"
      onclick={sessionFilter.reset}
    >
      <Icon icon="lucide:filter-x" class="size-4 opacity-70" />
      {m.filter_reset()}
    </button>
  {/if}
</div>

<div
  id="{uid}-sort"
  popover="auto"
  style:position-anchor="--{uid}-sort"
  class={[
    "anchored popover-box fixed inset-auto m-0 my-1 hidden w-52 flex-col gap-1 p-1",
    "text-sm text-base-content open:flex",
  ]}
>
  {#each SORTS as sort (sort.id)}
    {@render choice(
      sessionFilter.value.sort === sort.id,
      sort.label(),
      sort.icon,
      () => sessionFilter.set({ sort: sort.id }),
    )}
  {/each}
</div>

<ul class="menu w-full gap-0.5 px-2 pt-0">
  {#each items as item (item.key)}
    {@const fresh = unread.has(item.key)}
    <li>
      <button
        type="button"
        class={[
          "min-w-0 cursor-grab active:cursor-grabbing",
          activeKey === item.key && "menu-active",
        ]}
        title="{item.source}. {statusOf(item)}"
        draggable="true"
        ondragstart={e => startDrag(e, item.current)}
        onclick={() => openConversation(item.current)}
        oncontextmenu={e => contextMenu.show(e, menuFor(item))}
      >
        <Icon
          icon={item.icon}
          class={["size-4 shrink-0", item.live ? "opacity-80" : "opacity-40"]}
        />
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
            class="size-3.5 shrink-0 opacity-50"
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
      </button>
    </li>
  {:else}
    <li class="flex flex-row items-center gap-2 px-3 py-2 text-sm text-base-content/50">
      <Icon icon="lucide:inbox" class="size-4" />
      {all.length ? m.filter_empty() : m.chat_none()}
    </li>
  {/each}
</ul>

<style>
  .anchored {
    position-area: block-end span-inline-start;
    position-try-fallbacks: flip-inline, flip-block;
  }
</style>
