<script lang="ts">
import Icon from "@iconify/svelte"
import { SvelteDate } from "svelte/reactivity"
import { z } from "zod"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { tooltip } from "#lib/components/ui/tooltip.ts"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { SPACE_HUES, type Space } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import { contextMenu, type MenuItem } from "#lib/store/contextMenu.svelte.ts"
import { droppedConversation, isConversationDrag, startDrag } from "#lib/store/drag.ts"
import { keyOf } from "#lib/store/keys.ts"
import { goPage, nav, openConversation } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import type { Recent } from "#lib/store/recent.ts"
import {
  type AgentRow,
  folderKey,
  type SpaceNode,
  type Status,
  spaceTree,
} from "#lib/store/spaceTree.ts"
import { Stored } from "#lib/store/stored.svelte.ts"
import { unread } from "#lib/store/unread.svelte.ts"
import { conversationMenu } from "./conversationMenu.ts"
import FolderPicker from "./FolderPicker.svelte"

let { rail = false }: { rail?: boolean } = $props()

const SPACE_MIME = "application/x-atrix-space"

const attempt = new Attempt()

const tree = $derived(spaceTree())

const empty = $derived(tree.chats.length === 0 && tree.hosts.every(h => h.spaces.length === 0))

const many = $derived(tree.hosts.length > 1)

const activeKey = $derived(panes.active.current ? keyOf(panes.active.current) : null)

const openKeys = $derived(
  new Set(panes.leaves.flatMap(l => (l.current ? [keyOf(l.current)] : []))),
)

const clustered = $derived(panes.leaves.length > 1 ? openKeys : new Set<string>())

const now = new SvelteDate()

const units = [
  { unit: "day", ms: 86_400_000 },
  { unit: "hour", ms: 3_600_000 },
  { unit: "minute", ms: 60_000 },
] as const

const elapsed = (since: number) => {
  const gap = Math.max(0, now.getTime() - since)
  const found = units.find(u => gap >= u.ms) ?? units[2]

  const format = new Intl.NumberFormat(getLocale(), {
    style: "unit",
    unit: found.unit,
    unitDisplay: "narrow",
  })

  return gap < found.ms ? `<${format.format(1)}` : format.format(Math.floor(gap / found.ms))
}

$effect(() => {
  const timer = setInterval(() => now.setTime(Date.now()), 30_000)

  return () => clearInterval(timer)
})

const folds = new Stored("space-fold:", null as boolean | null, z.boolean().nullable())

const CHATS = "chats"

let frozen = $state.raw<Map<string, number> | null>(null)

const freeze = () => {
  frozen = new Map(
    tree.hosts.flatMap(h => h.spaces.flatMap(n => n.agents.map((a, i) => [a.id, i] as const))),
  )
}

const ordered = (node: SpaceNode) => {
  if (!frozen) {
    return node.agents
  }

  const at = frozen
  const rank = (id: string) => at.get(id) ?? Number.MAX_SAFE_INTEGER

  return node.agents.toSorted((a, b) => rank(a.id) - rank(b.id))
}

const folded = (node: SpaceNode) => folds.get(node.key) ?? false

let editing = $state<{
  host: string
  key: string | null
  node: SpaceNode | null
  name: string
  folder: string
} | null>(null)

let hint = $state<{ key: string; after: boolean } | null>(null)

const STATUS_LABEL: Record<Status, () => string> = {
  waiting: m.status_waiting,
  running: m.status_running,
  done: m.status_done,
  idle: m.status_idle,
}

const colorOf = (space: Space) => `oklch(62% 0.15 ${SPACE_HUES[space.color]})`

const hintAt = (e: DragEvent, key: string) => {
  e.preventDefault()

  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()

  hint = { key, after: e.clientY > r.top + r.height / 2 }
}

const clear = () => {
  hint = null
}

const draggedSpace = (e: DragEvent) => e.dataTransfer?.types.includes(SPACE_MIME) ?? false

const dropOnAgent = async (e: DragEvent, host: string, node: SpaceNode, target: string) => {
  e.preventDefault()

  const after = hint?.after ?? false

  clear()

  const dropped = droppedConversation(e)

  if (dropped?.kind !== "session" || dropped.host !== host) {
    return
  }

  if (target === dropped.id) {
    return
  }

  const shown = ordered(node)
    .map(a => a.id)
    .filter(id => id !== dropped.id)
  const explicit = new Set(node.space.agents)
  const rest = shown.slice(shown.indexOf(target) + (after ? 1 : 0))
  const before = rest.find(id => explicit.has(id)) ?? null

  await placeIn(host, node, dropped.id, before)
}

const materialize = async (host: string, node: SpaceNode, name = node.space.name) => {
  if (!node.auto) {
    return node.space.id
  }

  const view = hostById(host)
  const space = await view?.createSpace(name, node.space.folder, node.space.color)
  const loose = new Set(view?.state?.loose ?? [])

  for (const row of node.agents.filter(a => loose.has(a.id))) {
    await view?.place(row.id, space?.id ?? null, null)
  }

  return space?.id ?? null
}

const placeIn = async (host: string, node: SpaceNode, sessionId: string, before: string | null) => {
  const view = hostById(host)
  const row = tree.hosts
    .find(h => h.id === host)
    ?.spaces.flatMap(n => n.agents)
    .find(a => a.id === sessionId)
  const home = node.auto && folderKey(row?.item.cwd ?? "") === folderKey(node.space.folder)

  if (home) {
    return view?.place(sessionId, null, null)
  }

  const space = await materialize(host, node)

  if (space) {
    await view?.place(sessionId, space, before)
  }
}

const dropOnSpace = async (e: DragEvent, host: string, node: SpaceNode, nodes: SpaceNode[]) => {
  e.preventDefault()

  const after = hint?.after ?? false

  clear()

  const view = hostById(host)
  const [from, moving] = (e.dataTransfer?.getData(SPACE_MIME) ?? "").split("|")

  if (moving && from !== host) {
    return
  }

  if (moving) {
    const spaces = nodes.flatMap(n => (!n.auto && n.space.id !== moving ? [n.space.id] : []))
    const target = node.space.id

    if (target === moving) {
      return
    }

    if (node.auto) {
      return view?.moveSpace(moving, null)
    }

    const at = spaces.indexOf(target)

    return view?.moveSpace(moving, after ? (spaces[at + 1] ?? null) : target)
  }

  const dropped = droppedConversation(e)

  if (dropped?.kind === "session" && dropped.host === host) {
    await placeIn(host, node, dropped.id, null)
  }
}

const startAgent = (host: string, node: SpaceNode) => {
  const space = node.space

  goPage("chat")
  openConversation(null)
  nav.space = node.auto ? null : { host, id: space.id }

  const harness =
    nav.target.kind === "harness" && nav.target.host === host
      ? nav.target.harness
      : hostById(host)?.state?.harnesses.find(h => h.enabled)?.id

  if (harness) {
    nav.target = {
      kind: "harness",
      host,
      harness,
      cwd:
        space.folder ||
        (nav.target.kind === "harness"
          ? nav.target.cwd
          : (hostById(host)?.state?.home ?? "")),
    }
  }
}

const save = async () => {
  if (!editing?.name.trim()) {
    return
  }

  const { host, node, name, folder } = editing
  const view = hostById(host)

  if (node && !node.auto) {
    await view?.updateSpace(node.space.id, { name, folder: folder.trim() })
  } else if (node && folderKey(folder.trim()) === folderKey(node.space.folder)) {
    await materialize(host, node, name)
  } else {
    await view?.createSpace(name, folder.trim())
  }

  editing = null
}

const spaceMenu = (host: string, node: SpaceNode): MenuItem[] => {
  const view = hostById(host)
  const space = node.space
  const ids = (view?.state?.spaces ?? []).map(s => s.id)
  const at = ids.indexOf(space.id)

  const shared: MenuItem[] = [
    {
      label: m.space_new_agent(),
      icon: "lucide:square-pen",
      run: () => startAgent(host, node),
    },
    "separator",
    {
      label: m.space_edit(),
      icon: "lucide:pencil",
      run: () => {
        editing = { host, key: node.key, node, name: space.name, folder: space.folder }
      },
    },
    {
      label: m.space_color(),
      icon: "lucide:palette",
      run: () =>
        attempt.run(async () => {
          const id = await materialize(host, node)

          if (id) {
            await view?.updateSpace(id, { color: (space.color + 1) % SPACE_HUES.length })
          }
        }),
    },
  ]

  if (node.auto) {
    return shared
  }

  return [
    ...shared,
    "separator",
    {
      label: m.space_move_up(),
      icon: "lucide:arrow-up",
      disabled: at <= 0,
      run: () => attempt.run(async () => view?.moveSpace(space.id, ids[at - 1] ?? null)),
    },
    {
      label: m.space_move_down(),
      icon: "lucide:arrow-down",
      disabled: at === -1 || at >= ids.length - 1,
      run: () => attempt.run(async () => view?.moveSpace(space.id, ids[at + 2] ?? null)),
    },
    "separator",
    {
      label: m.space_delete(),
      icon: "lucide:trash-2",
      danger: true,
      confirm: m.menu_confirm_delete(),
      run: () => attempt.run(async () => view?.deleteSpace(space.id)),
    },
  ]
}

const agentMenu = (host: string, node: SpaceNode, row: AgentRow): MenuItem[] => {
  const view = hostById(host)
  const spaces = (view?.state?.spaces ?? []).filter(s => s.id !== node.space.id)

  return [
    ...conversationMenu(row.item, row),
    {
      label: row.pinned ? m.space_unpin() : m.space_pin(),
      icon: row.pinned ? "lucide:pin-off" : "lucide:pin",
      run: () => attempt.run(async () => view?.pin(row.id, !row.pinned)),
    },
    "separator",
    ...spaces.map(s => ({
      label: s.name,
      icon: "lucide:folder-input",
      run: () => attempt.run(async () => view?.place(row.id, s.id, null)),
    })),
    ...(node.auto
      ? []
      : [
          {
            label: m.space_unplace(),
            icon: "lucide:folder",
            run: () => attempt.run(async () => view?.place(row.id, null, null)),
          },
        ]),
  ]
}

const railRows = $derived(
  tree.hosts.flatMap(h =>
    h.spaces.flatMap(n => n.agents),
  ),
)
</script>

{#snippet status(state: Status, live: boolean, fresh = false)}
  <span class="grid size-4 shrink-0 place-items-center" role="img" aria-label={STATUS_LABEL[state]()}>
    {#if state === "waiting"}
      <span class="size-2 rounded-full bg-warning"></span>
    {:else if state === "running"}
      <span class="loading loading-spinner loading-xs text-primary"></span>
    {:else if state === "done" || fresh}
      <span class="size-2 rounded-full bg-primary"></span>
    {:else if live}
      <span class="size-1.5 rounded-full bg-success/70"></span>
    {/if}
  </span>
{/snippet}

{#snippet editor()}
  {#if editing}
    {@const view = hostById(editing.host)}
    <form
      class="mx-2 my-1 flex flex-col gap-2 rounded-field bg-base-content/5 p-2"
      onsubmit={e => {
        e.preventDefault()
        attempt.run(save)
      }}
    >
      <input
        class="input input-sm w-full"
        aria-label={m.spaces_name()}
        placeholder={m.spaces_name()}
        bind:value={editing.name}
        {@attach el => el.focus()}
        onkeydown={e => {
          if (e.key === "Escape") {
            editing = null
          }
        }}
      />
      {#if many && editing.node === null}
        <select class="select select-sm w-full" aria-label={m.spaces_host()} bind:value={editing.host}>
          {#each tree.hosts as h (h.id)}
            <option value={h.id}>{h.name}</option>
          {/each}
        </select>
      {/if}
      <FolderPicker host={view} bind:value={editing.folder} class="w-full" />
      <div class="flex justify-end gap-1">
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => (editing = null)}>
          {m.common_cancel()}
        </button>
        <button type="submit" class="btn btn-primary btn-sm" disabled={!editing.name.trim()}>
          {m.common_save()}
        </button>
      </div>
    </form>
  {/if}
{/snippet}

{#snippet agent(host: string, node: SpaceNode, row: AgentRow)}
  {@const key = `${node.key}/${row.id}`}
  <li class="relative">
    {#if hint?.key === key}
      <span
        class={[
          "pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-primary",
          hint.after ? "-bottom-0.5" : "-top-0.5",
        ]}
      ></span>
    {/if}
    <button
      type="button"
      class={[
        "min-w-0 cursor-grab gap-2 ps-7 pe-1.5 active:cursor-grabbing",
        activeKey === row.item.key && "menu-active",
        activeKey !== row.item.key && clustered.has(row.item.key) && "bg-base-content/5",
      ]}
      title={row.item.source}
      draggable="true"
      ondragstart={e => startDrag(e, row.item.current)}
      ondragover={e =>
        isConversationDrag(e) && node.space.agents.includes(row.id) && hintAt(e, key)}
      ondragleave={clear}
      ondrop={e => attempt.run(() => dropOnAgent(e, host, node, row.id))}
      onclick={() => openConversation(row.item.current)}
      oncontextmenu={e => contextMenu.show(e, agentMenu(host, node, row))}
    >
      <Icon icon={row.item.icon} class="size-4 shrink-0 opacity-80" />
      <span class={["min-w-0 flex-1 truncate", row.status === "done" && "font-semibold"]}>
        {row.item.title}
      </span>
      {#if row.pinned}
        <Icon icon="lucide:pin" class="size-3 shrink-0 opacity-50" aria-label={m.space_pinned()} />
      {/if}
      {#if openKeys.has(row.item.key) && activeKey !== row.item.key}
        <Icon icon="lucide:panel-right" class="size-3.5 shrink-0 opacity-50" aria-label={m.chat_open_elsewhere()} />
      {/if}
      {#if row.since}
        <span class="shrink-0 text-xs text-base-content/45 tabular-nums">{elapsed(row.since)}</span>
      {/if}
      {@render status(row.status, row.item.live)}
    </button>
    {#if row.subagents.length > 0}
      <ul class="ms-9 border-s border-base-content/10 ps-2">
        {#each row.subagents as sub (sub.id)}
          <li class="flex min-w-0 items-center gap-2 py-0.5 text-xs text-base-content/60">
            <Icon icon="lucide:bot" class="size-3.5 shrink-0" />
            <span class="min-w-0 flex-1 truncate" title={sub.description}>{sub.description}</span>
            <span class="loading loading-spinner loading-xs shrink-0 opacity-60"></span>
          </li>
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

{#snippet spaceHeader(host: string, node: SpaceNode, nodes: SpaceNode[])}
  {@const open = !folded(node)}
  <div class="relative">
    {#if hint?.key === node.key}
      <span
        class={[
          "pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-primary",
          hint.after ? "-bottom-0.5" : "-top-0.5",
        ]}
      ></span>
    {/if}
    <button
      type="button"
      class={[
        "flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-field px-2 text-sm",
        "transition-colors duration-140 hover:bg-base-content/8",
      ]}
      aria-expanded={open}
      aria-label={m.space_toggle({ name: node.space.name })}
      title={node.space.folder}
      draggable={!node.auto}
      ondragstart={e => {
        if (!node.auto) {
          e.dataTransfer?.setData(SPACE_MIME, `${host}|${node.space.id}`)
          e.dataTransfer?.setData("text/plain", "")
        }
      }}
      ondragover={e => (draggedSpace(e) || isConversationDrag(e)) && hintAt(e, node.key)}
      ondragleave={clear}
      ondrop={e => attempt.run(async () => dropOnSpace(e, host, node, nodes))}
      onclick={() => folds.set(node.key, open)}
      oncontextmenu={e => contextMenu.show(e, spaceMenu(host, node))}
    >
      <span
        class="grid size-5 shrink-0 place-items-center rounded-field text-xs font-semibold text-white"
        style:background-color={colorOf(node.space)}
      >
        {[...node.space.name][0]?.toUpperCase()}
      </span>
      <span class="min-w-0 flex-1 truncate text-start font-medium">{node.space.name}</span>
      <span class="shrink-0 text-xs text-base-content/50 tabular-nums">{node.agents.length}</span>
      {@render status(node.status, false)}
      <Icon
        icon="lucide:chevron-down"
        class={["size-3.5 shrink-0 opacity-50 transition-transform duration-140", !open && "-rotate-90"]}
      />
    </button>
  </div>
{/snippet}

{#if rail}
  <ul class="menu w-full items-center gap-0.5 px-1 pt-0">
    {#each railRows as row (row.item.key)}
      <li>
        <button
          type="button"
          class={["size-8 content-center justify-center p-0", activeKey === row.item.key && "menu-active"]}
          aria-label={row.item.title}
          {@attach tooltip(() => [row.item.title, row.item.source, STATUS_LABEL[row.status]()], () => true)}
          draggable="true"
          ondragstart={e => startDrag(e, row.item.current)}
          onclick={() => openConversation(row.item.current)}
          oncontextmenu={e => contextMenu.show(e, conversationMenu(row.item, row))}
        >
          <Icon
            icon={row.item.icon}
            class={[
              "size-4 shrink-0",
              row.status === "idle"
                ? "opacity-60"
                : row.status === "waiting"
                  ? "text-warning"
                  : "text-primary",
              row.status === "running" && "animate-breathe",
            ]}
          />
        </button>
      </li>
    {/each}
    {#each tree.chats as item (item.key)}
      <li>
        <button
          type="button"
          class={["size-8 content-center justify-center p-0", activeKey === item.key && "menu-active"]}
          aria-label={item.title}
          {@attach tooltip(() => [item.title, item.source], () => true)}
          draggable="true"
          ondragstart={e => startDrag(e, item.current)}
          onclick={() => openConversation(item.current)}
          oncontextmenu={e => contextMenu.show(e, conversationMenu(item, null))}
        >
          <Icon
            icon={item.icon}
            class={["size-4 shrink-0", unread.has(item.key) ? "text-primary" : "opacity-60"]}
          />
        </button>
      </li>
    {/each}
  </ul>
{:else}
  <div
    class="flex flex-col gap-1 pb-2"
    role="presentation"
    onpointerenter={freeze}
    onpointerleave={() => (frozen = null)}
  >
    <div class="flex h-8 items-center gap-1 ps-4 pe-2">
      <span class="min-w-0 flex-1 truncate text-xs font-medium text-base-content/60">
        {m.spaces_title()}
      </span>
      <IconButton
        icon="lucide:plus"
        label={m.spaces_new()}
        size="xs"
        onclick={() => {
          const host = tree.hosts.find(h => h.local) ?? tree.hosts[0]

          if (host) {
            editing = { host: host.id, key: null, node: null, name: "", folder: "" }
          }
        }}
      />
    </div>
    {#if editing && editing.key === null}
      {@render editor()}
    {/if}
    <ErrorAlert message={attempt.failure} />
    {#if empty && !editing}
      <EmptyState icon="lucide:inbox" text={m.chat_none()} class="py-6" />
    {/if}
    {#each tree.hosts as host (host.id)}
      <section class="flex flex-col">
        {#if many}
          <h3 class="truncate px-4 pt-2 pb-1 text-xs text-base-content/50">{host.name}</h3>
        {/if}
        {#each host.spaces as node (node.key)}
          {#if editing?.key === node.key}
            {@render editor()}
          {:else}
            <div class="px-2">
              {@render spaceHeader(host.id, node, host.spaces)}
            </div>
            {#if !folded(node)}
              <ul class="menu w-full gap-0.5 py-0 ps-2 pe-1">
                {#each ordered(node) as row (row.id)}
                  {@render agent(host.id, node, row)}
                {/each}
              </ul>
            {/if}
          {/if}
        {/each}
      </section>
    {/each}
    {#if tree.chats.length > 0}
      <div class="px-2 pt-2">
        <button
          type="button"
          class={[
            "flex h-8 w-full cursor-pointer items-center gap-2 rounded-field px-2 text-sm",
            "transition-colors duration-140 hover:bg-base-content/8",
          ]}
          aria-expanded={!(folds.get(CHATS) ?? false)}
          onclick={() => folds.set(CHATS, !(folds.get(CHATS) ?? false))}
        >
          <Icon icon="lucide:messages-square" class="size-4 shrink-0 opacity-60" />
          <span class="min-w-0 flex-1 truncate text-start font-medium">{m.spaces_chats()}</span>
          <span class="shrink-0 text-xs text-base-content/50 tabular-nums">{tree.chats.length}</span>
          <Icon
            icon="lucide:chevron-down"
            class={["size-3.5 shrink-0 opacity-50 transition-transform duration-140", folds.get(CHATS) && "-rotate-90"]}
          />
        </button>
      </div>
      {#if !folds.get(CHATS)}
        <ul class="menu w-full gap-0.5 py-0 ps-2 pe-1">
          {#each tree.chats as item (item.key)}
            {@render chat(item)}
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
{/if}

{#snippet chat(item: Recent)}
  {@const fresh = unread.has(item.key)}
  <li>
    <button
      type="button"
      class={["min-w-0 cursor-grab gap-2 ps-7 pe-1.5 active:cursor-grabbing", activeKey === item.key && "menu-active"]}
      title={item.source}
      draggable="true"
      ondragstart={e => startDrag(e, item.current)}
      onclick={() => openConversation(item.current)}
      oncontextmenu={e => contextMenu.show(e, conversationMenu(item, null))}
    >
      <Icon icon={item.icon} class="size-4 shrink-0 opacity-80" />
      <span class={["min-w-0 flex-1 truncate", fresh && "font-semibold"]}>{item.title}</span>
      {@render status(item.running ? "running" : "idle", false, fresh)}
    </button>
  </li>
{/snippet}
