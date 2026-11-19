<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Modal from "#lib/components/ui/Modal.svelte"
import Select from "#lib/components/ui/Select.svelte"
import { tooltip } from "#lib/components/ui/tooltip.ts"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { SPACE_HUES, type Space } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu, type MenuItem } from "#lib/store/contextMenu.svelte.ts"
import { startDrag } from "#lib/store/drag.ts"
import { keyOf } from "#lib/store/keys.ts"
import {
  goPage,
  nav,
  openConversation,
} from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import {
  type AgentRow,
  folderKey,
  type SpaceNode,
  type Status,
  spaceTree,
} from "#lib/store/spaceTree.ts"
import { conversationMenu } from "./conversationMenu.ts"
import FolderPicker from "./FolderPicker.svelte"
import { elapsed } from "./format.ts"
import SessionPicker from "./SessionPicker.svelte"

let { rail = false }: { rail?: boolean } = $props()

const attempt = new Attempt()

const tree = $derived(spaceTree())

const shown = $derived(tree.hosts.filter(h => h.spaces.length > 0))

const many = $derived(shown.length > 1)

type Entry = { host: (typeof shown)[number]; node: SpaceNode; row: AgentRow }

const DAY_MS = 86_400_000

const SETTLE_MS = DAY_MS

const entries = $derived(
  shown.flatMap(host =>
    host.spaces.flatMap(node => node.agents.map(row => ({ host, node, row }))),
  ),
)

const recency = (entry: Entry) => entry.row.since ?? 0

const tier = (entry: Entry) =>
  entry.row.pinned ? 0 : entry.row.status === "idle" ? 2 : 1

let frozen = $state.raw<Map<string, number> | null>(null)

const sorted = $derived.by(() => {
  const at = frozen
  const natural = entries.toSorted(
    (a, b) => tier(a) - tier(b) || recency(b) - recency(a),
  )

  if (!at) {
    return natural
  }

  const rank = (entry: Entry) => at.get(entry.row.item.key) ?? Number.MAX_SAFE_INTEGER

  return natural.toSorted((a, b) => rank(a) - rank(b))
})

const freeze = () => {
  frozen = new Map(sorted.map((e, i) => [e.row.item.key, i]))
}

const empty = $derived(entries.length === 0)

const activeKey = $derived(panes.active.current ? keyOf(panes.active.current) : null)

const openKeys = $derived(
  new Set(panes.leaves.flatMap(l => (l.current ? [keyOf(l.current)] : []))),
)

const clustered = $derived(panes.leaves.length > 1 ? openKeys : new Set<string>())

$effect(() => {
  const timer = setInterval(() => (now = Date.now()), 30_000)

  return () => clearInterval(timer)
})

let now = $state(Date.now())

const settledOf = (entry: Entry) =>
  tier(entry) === 2 && now - recency(entry) > SETTLE_MS

const recent = $derived(sorted.filter(e => !settledOf(e)))

const settled = $derived(sorted.filter(settledOf))

let showSettled = $state(false)

let editing = $state<{
  host: string
  node: SpaceNode | null
  name: string
  folder: string
} | null>(null)

let adding = $state<{ host: string; node: SpaceNode } | null>(null)

const STATUS_LABEL: Record<Status, () => string> = {
  waiting: m.status_waiting,
  running: m.status_running,
  done: m.status_done,
  idle: m.status_idle,
}

const colorOf = (space: Space) => `oklch(62% 0.15 ${SPACE_HUES[space.color]})`

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

const placeIn = async (host: string, node: SpaceNode, id: string, before: string | null) => {
  const view = hostById(host)
  const home = node.auto && folderKey(tree.hosts
    .find(h => h.id === host)?.spaces.flatMap(n => n.agents).find(a => a.id === id)?.item.cwd ?? "") === folderKey(node.space.folder)

  if (home) {
    await view?.place(id, null, null)
    return
  }

  const space = await materialize(host, node)

  if (space) {
    await view?.place(id, space, before)
  }
}
const startAgent = (host: string, node: SpaceNode) => {
  const space = node.space
  const current = nav.target.kind === "harness" ? nav.target : null

  goPage("chat")
  openConversation(null)
  nav.space = node.auto ? null : { host, id: space.id }

  const harness =
    current && current.host === host
      ? current.harness
      : hostById(host)?.state?.harnesses.find(h => h.enabled)?.id

  if (harness) {
    nav.target = {
      kind: "harness",
      host,
      harness,
      cwd:
        space.folder ||
        (current
          ? current.cwd
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

  const shared: MenuItem[] = [
    {
      label: m.space_new_agent(),
      icon: "lucide:square-pen",
      run: () => startAgent(host, node),
    },
    {
      label: m.space_add_session(),
      icon: "lucide:list-plus",
      run: () => {
        adding = { host, node }
      },
    },
    "separator",
    {
      label: m.space_edit(),
      icon: "lucide:pencil",
      run: () => {
        editing = { host, node, name: space.name, folder: space.folder }
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

  const live = node.agents.filter(a => view?.state?.open.some(s => s.id === a.id))
  const close: MenuItem[] =
    live.length > 0
      ? [
          "separator",
          {
            label: m.space_close(),
            icon: "lucide:circle-x",
            run: () =>
              attempt.run(async () => {
                for (const row of live) {
                  panes.forget(row.item.current)
                  await view?.close(row.id)
                }
              }),
          },
        ]
      : []

  if (node.auto) {
    return [...shared, ...close]
  }

  return [
    ...shared,
    ...close,
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

const railRows = $derived(sorted.map(e => e.row))

const menuOf = (e: MouseEvent, entry: Entry) => {
  const onSpace = e.target instanceof Element && !!e.target.closest("[data-space]")

  contextMenu.show(
    e,
    onSpace
      ? spaceMenu(entry.host.id, entry.node)
      : agentMenu(entry.host.id, entry.node, entry.row),
  )
}
</script>

{#snippet status(state: Status, live: boolean, fresh = false)}
  <span class="grid size-4 shrink-0 place-items-center justify-items-end" role="img" aria-label={STATUS_LABEL[state]()}>
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
      class="flex flex-col gap-4 p-5"
      onsubmit={e => {
        e.preventDefault()
        attempt.run(save)
      }}
    >
      <h2 class="text-base font-semibold">
        {editing.node ? m.space_edit() : m.spaces_new()}
      </h2>
      <input
        class="input w-full"
        aria-label={m.spaces_name()}
        placeholder={m.spaces_name()}
        bind:value={editing.name}
        {@attach el => el.focus()}
      />
      {#if many && editing.node === null}
        <Select
          class="w-full"
          label={m.spaces_host()}
          options={tree.hosts.map(h => ({ value: h.id, label: h.name }))}
          bind:value={editing.host}
        />
      {/if}
      <FolderPicker host={view} bind:value={editing.folder} class="w-full justify-start" />
      <div class="flex justify-end gap-2">
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

<SessionPicker
  host={adding?.host ?? null}
  exclude={adding?.node.agents.map(a => a.id) ?? []}
  onpick={id => (adding ? placeIn(adding.host, adding.node, id, null) : Promise.resolve())}
  onclose={() => (adding = null)}
/>

<Modal
  bind:open={
    () => editing !== null,
    open => {
      if (!open) {
        editing = null
      }
    }
  }
  label={editing?.node ? m.space_edit() : m.spaces_new()}
  class="max-w-md"
>
  {@render editor()}
</Modal>

{#snippet entryRow(entry: Entry)}
  {@const { host, node, row } = entry}
  {@const active = activeKey === row.item.key}
  {@const device = many && !host.local ? host.name : null}
  <li class="min-w-0">
    <button
      type="button"
      class={[
        "flex w-full min-w-0 cursor-grab flex-col gap-0.5 rounded-field px-2 py-1.5 text-start outline-none",
        "transition-colors duration-140 active:cursor-grabbing",
        active
          ? "bg-primary/8"
          : clustered.has(row.item.key)
            ? "bg-base-content/5"
            : "hover:bg-base-content/5 focus-visible:bg-base-content/5",
      ]}
      title={row.item.source}
      draggable="true"
      ondragstart={e => startDrag(e, row.item.current)}
      onclick={() => openConversation(row.item.current)}
      oncontextmenu={e => menuOf(e, entry)}
    >
      <span class="flex min-w-0 items-center gap-1.5 text-xs text-base-content/50">
        <span data-space class="flex min-w-0 items-center gap-1.5" title={node.space.folder}>
          <span class="size-2 shrink-0 rounded-full" style:background-color={colorOf(node.space)}></span>
          <span class="min-w-0 truncate">{node.space.name}</span>
        </span>
        {#if device}
          <span class="shrink-0" {@attach tooltip(() => [device], () => true)}>
            <Icon icon="lucide:monitor" class="size-3" aria-label={device} />
          </span>
        {/if}
        <span class="flex-1"></span>
        {#if row.pinned}
          <Icon icon="lucide:pin" class="size-3 shrink-0" aria-label={m.space_pinned()} />
        {/if}
        {#if openKeys.has(row.item.key) && !active}
          <Icon icon="lucide:panel-right" class="size-3 shrink-0" aria-label={m.chat_open_elsewhere()} />
        {/if}
        {#if row.since}
          <span class={["shrink-0 tabular-nums", row.status !== "idle" && "text-primary"]}>
            {elapsed(row.since, now)}
          </span>
        {/if}
      </span>
      <span class="flex min-w-0 items-center gap-2 text-sm">
        <span
          class={[
            "min-w-0 flex-1 truncate",
            row.status === "done" && "font-semibold",
            active && "text-primary",
          ]}
        >
          {row.item.title}
        </span>
        {#if row.status === "idle"}
          <Icon icon={row.item.icon} class="size-4 shrink-0 opacity-60" />
        {:else}
          {@render status(row.status, row.item.live)}
        {/if}
      </span>
    </button>
    {#if row.subagents.length > 0}
      <div class="flex w-full min-w-0 items-center gap-1 ps-3 pe-2">
        <span class="mb-2.5 h-3 w-2 shrink-0 self-end rounded-es-md border-s border-b border-base-content/25"></span>
        <div class="flex min-w-0 -space-x-2 overflow-hidden">
          {#each row.subagents as sub (sub.id)}
            {@const target = {
              kind: "session" as const,
              host: host.id,
              id: row.id,
              agent: { id: sub.id, description: sub.description },
            }}
            <button
              type="button"
              class={[
                "relative grid size-6 cursor-pointer place-items-center rounded-full border-2 border-base-200",
                "transition-colors duration-140 hover:z-10 hover:bg-base-content/25",
                activeKey === keyOf(target) ? "bg-primary text-primary-content" : "bg-base-300 text-base-content/80",
              ]}
              aria-label={sub.description}
              {@attach tooltip(() => [sub.description], () => true)}
              onclick={() => openConversation(target)}
            >
              <Icon icon={row.item.icon} class="size-3.5 animate-breathe" />
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </li>
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
  </ul>
{:else}
  <div
    class="flex flex-col pb-2"
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
            editing = { host: host.id, node: null, name: "", folder: "" }
          }
        }}
      />
    </div>
    <ErrorAlert message={attempt.failure} />
    {#if empty && !editing}
      <EmptyState icon="lucide:inbox" text={m.chat_none()} class="py-6" />
    {/if}
    <ul class="flex flex-col gap-0.5 px-2">
      {#each recent as entry (entry.row.item.key)}
        {@render entryRow(entry)}
      {/each}
    </ul>
    {#if settled.length > 0}
      <button
        type="button"
        class={[
          "mx-2 mt-2 flex h-7 cursor-pointer items-center gap-2 rounded-field px-2 text-xs text-base-content/50 outline-none",
          "transition-colors duration-140 hover:bg-base-content/5 focus-visible:bg-base-content/5",
        ]}
        aria-expanded={showSettled}
        onclick={() => (showSettled = !showSettled)}
      >
        <span class="min-w-0 flex-1 truncate text-start">{m.spaces_settled({ count: settled.length })}</span>
        <Icon
          icon="lucide:chevron-down"
          class={["size-3.5 shrink-0 transition-transform duration-140", showSettled && "rotate-180"]}
        />
      </button>
      {#if showSettled}
        <ul class="flex flex-col gap-0.5 px-2">
          {#each settled as entry (entry.row.item.key)}
            {@render entryRow(entry)}
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
{/if}

