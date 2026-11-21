<script lang="ts">
import Icon from "@iconify/svelte"
import { z } from "zod"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { tooltip } from "#lib/components/ui/tooltip.ts"
import { screen } from "#lib/lock/lock.svelte.ts"
import { floatSidebar } from "#lib/p2p/float.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { contextMenu } from "#lib/store/contextMenu.svelte.ts"
import { startNewChatDrag } from "#lib/store/drag.ts"
import { goPage, nav, openConversation, openSettings } from "#lib/store/nav.svelte.ts"
import { APPS_PAGE, CALENDAR_PAGE, PAGES, SETTINGS_PAGE } from "#lib/store/pages.ts"
import { shell } from "#lib/store/shell.svelte.ts"
import { type ShortcutId, withKeys } from "#lib/store/shortcuts.ts"
import { persisted, Stored } from "#lib/store/stored.svelte.ts"
import Navigator from "./Navigator.svelte"

let { rail = false, floated = false }: { rail?: boolean; floated?: boolean } = $props()

type Action = {
  label: string
  icon: string
  shortcut?: ShortcutId
  pressed?: boolean
  drag?: (e: DragEvent) => void
  run: () => void
}

type Item = Action & { id: string }

const newChat = (): Action => ({
  label: m.chat_new(),
  icon: "lucide:square-pen",
  shortcut: "new",
  drag: startNewChatDrag,
  run: () => {
    goPage("chat")
    openConversation(null)
  },
})

const PAGE_ACTIONS: Partial<Record<string, () => Action[]>> = {
  agent: () => [
    {
      label: m.agent_new(),
      icon: "lucide:user-plus",
      pressed: nav.agent === "new",
      run: () => {
        nav.agent = "new"
      },
    },
    {
      label: m.prompt_new(),
      icon: "lucide:file-plus-2",
      pressed: nav.agent === "prompt:new",
      run: () => {
        nav.agent = "prompt:new"
      },
    },
  ],
  data: () => [],
  devices: () => [],
  knowledge: () => [],
  settings: () => [],
}

const pageItem = (page: (typeof PAGES)[number]): Item => ({
  id: page.id,
  label: page.label(),
  icon: page.icon,
  pressed: nav.page === page.id,
  run: () => {
    goPage(page.id)

    if ((rail || shell.narrow) && page.id !== "chat" && page.id !== "calendar") {
      shell.drawer = true
      shell.peek = false
    }
  },
})

const items = $derived<Item[]>([
  {
    id: "search",
    label: m.common_search(),
    icon: "lucide:search",
    shortcut: "palette",
    run: () => {
      nav.palette = true
    },
  },
  {
    id: "apps",
    label: APPS_PAGE.label(),
    icon: APPS_PAGE.icon,
    pressed: nav.page === "apps",
    run: () => goPage("apps"),
  },
  ...[...PAGES, CALENDAR_PAGE].map(pageItem),
  {
    id: "settings",
    label: SETTINGS_PAGE.label(),
    icon: SETTINGS_PAGE.icon,
    pressed: nav.settingsOpen,
    run: () => openSettings(nav.settingsTab),
  },
  {
    id: "lock",
    label: m.lock_now(),
    icon: "lucide:lock",
    run: screen.lock,
  },
])

type Zone = "top" | "bottom"

type Layout = Record<Zone, string[]>

const DEFAULT_LAYOUT: Layout = {
  top: ["search", "apps"],
  bottom: ["chat", "agent", "knowledge", "data", "devices", "calendar", "lock", "settings"],
}

const layouts = new Stored(
  "nav-dock:",
  DEFAULT_LAYOUT,
  z.object({ top: z.array(z.string()), bottom: z.array(z.string()) }),
)

const LEGACY_KEYS = ["order:pages", "nav-bar:sidebar"]

const legacy = LEGACY_KEYS.map(key => persisted(key, null, z.array(z.string()).nullable())).find(
  Boolean,
)

if (legacy) {
  layouts.set("sidebar", {
    top: DEFAULT_LAYOUT.top,
    bottom: legacy.filter(id => !DEFAULT_LAYOUT.top.includes(id)),
  })

  for (const key of LEGACY_KEYS) {
    localStorage.removeItem(key)
  }
}

const layout = $derived(layouts.get("sidebar"))

const zones = $derived.by(() => {
  const known = new Map(items.map(i => [i.id, i]))
  const placed = new Set([...layout.top, ...layout.bottom])
  const pick = (ids: string[]) => ids.flatMap(id => known.get(id) ?? [])

  return {
    top: pick(layout.top),
    bottom: [...pick(layout.bottom), ...items.filter(i => !placed.has(i.id))],
  }
})

const topPage = $derived(nav.page === "chat" || layout.top.includes(nav.page))

const actions: Action[] = $derived(
  (!topPage && PAGE_ACTIONS[nav.page]?.()) || [newChat()],
)

let dragging = $state<string | null>(null)

let hint = $state<{ zone: Zone; index: number } | null>(null)

const hoverItem = (e: DragEvent, zone: Zone, index: number) => {
  if (!dragging) {
    return
  }

  e.preventDefault()
  e.stopPropagation()

  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const vertical = zone === "top" || rail
  const after = vertical ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2

  hint = { zone, index: index + (after ? 1 : 0) }
}

const hoverEmpty = (e: DragEvent, zone: Zone) => {
  if (dragging && zones[zone].length === 0) {
    e.preventDefault()
    hint = { zone, index: 0 }
  }
}

const drop = (e: DragEvent) => {
  e.preventDefault()

  const moving = dragging

  if (moving && hint) {
    const ids = zones[hint.zone].map(i => i.id)
    const at = ids.indexOf(moving)
    const index = at !== -1 && at < hint.index ? hint.index - 1 : hint.index
    const next = {
      top: zones.top.map(i => i.id).filter(id => id !== moving),
      bottom: zones.bottom.map(i => i.id).filter(id => id !== moving),
    }

    next[hint.zone] = next[hint.zone].toSpliced(index, 0, moving)
    layouts.set("sidebar", next)
  }

  end()
}

const end = () => {
  dragging = null
  hint = null
}

const start = (e: DragEvent, id: string) => {
  dragging = id
  e.dataTransfer?.setData("text/plain", id)
}

const barMenu = (e: MouseEvent) =>
  contextMenu.show(e, [
    {
      label: m.common_reset(),
      icon: "lucide:rotate-ccw",
      run: () => layouts.set("sidebar", DEFAULT_LAYOUT),
    },
  ])

const toggleLabel = $derived(
  rail ? m.shell_expand_sidebar() : m.shell_close_sidebar(),
)

const hintOf = (action: Action) =>
  action.shortcut ? withKeys(action.label, action.shortcut) : action.label
</script>

{#snippet toggle()}
  {#if desktop && !floated && !rail}
    <IconButton
      icon="lucide:picture-in-picture-2"
      label={m.float_out()}
      class="shrink-0"
      onclick={() => floatSidebar(m.shell_sidebar())}
    />
  {/if}
  {#if !floated}
  <IconButton
    icon={rail ? "lucide:panel-left-open" : "lucide:panel-left"}
    label={toggleLabel}
    title={rail ? null : withKeys(toggleLabel, "sidebar")}
    class="shrink-0"
    {@attach tooltip(() => withKeys(toggleLabel, "sidebar"), () => rail)}
    onclick={shell.toggle}
  />
  {/if}
{/snippet}

{#snippet actionButton(action: Action, draggable = !!action.drag)}
  <button
    type="button"
    class={[
      "flex min-w-0 items-center gap-2 rounded-field text-sm",
      "transition-colors duration-140 hover:bg-base-content/8",
      draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
      rail ? "size-8 justify-center" : "h-9 flex-1 px-2.5",
      action.pressed && "bg-primary/8 text-primary hover:bg-primary/8",
    ]}
    aria-label={action.label}
    aria-pressed={action.pressed}
    {@attach tooltip(() => hintOf(action), () => rail)}
    draggable={draggable}
    ondragstart={action.drag}
    onclick={action.run}
  >
    <Icon icon={action.icon} class="size-4 shrink-0" />
    {#if !rail}
      <span class="min-w-0 flex-1 truncate text-start">{action.label}</span>
    {/if}
  </button>
{/snippet}

{#snippet marker(zone: Zone, index: number, last = false)}
  {#if hint?.zone === zone && hint.index === index}
    <span
      class={[
        "pointer-events-none absolute z-10 rounded-full bg-primary",
        zone === "top" || rail
          ? ["inset-x-1 h-0.5", last ? "-bottom-0.5" : "-top-0.5"]
          : ["inset-y-1 w-0.5", last ? "-right-0.5" : "-left-0.5"],
      ]}
    ></span>
  {/if}
{/snippet}

{#snippet slot(zone: Zone, item: Item, i: number, count: number)}
  <li
    class={[
      "relative flex",
      zone === "bottom" && !rail && "min-w-0 flex-1",
      dragging === item.id && "opacity-40",
    ]}
    draggable="true"
    ondragstart={e => start(e, item.id)}
    ondragover={e => hoverItem(e, zone, i)}
    ondrop={drop}
    ondragend={end}
  >
    {@render marker(zone, i)}
    {#if i === count - 1}
      {@render marker(zone, count, true)}
    {/if}
    {#if zone === "top"}
      {@render actionButton(item, true)}
    {:else}
      <IconButton
        icon={item.icon}
        label={item.label}
        title={null}
        shape={rail ? "square" : "wide"}
        class={[
          "cursor-grab transition-colors duration-140 active:cursor-grabbing",
          !rail && "min-w-0 flex-1 px-0",
          item.pressed && "bg-primary/8 text-primary hover:bg-primary/8",
        ]}
        aria-current={item.pressed && item.id !== "settings" ? "page" : undefined}
        {@attach tooltip(() => hintOf(item))}
        onclick={item.run}
      />
    {/if}
  </li>
{/snippet}

<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2 select-none" data-sidebar>
  <section class="island flex min-h-0 flex-1 flex-col overflow-hidden">
    <nav
      class={["flex shrink-0 flex-col gap-0.5", rail ? "items-center p-1.5" : "p-2 pb-3"]}
      aria-label={m.shell_actions()}
      data-tauri-drag-region
    >
      {#if rail}
        {@render toggle()}
        {#each actions as action (action.icon)}
          {@render actionButton(action)}
        {/each}
      {:else}
        {#each actions as action, i (action.icon)}
          <div class="flex items-center gap-1">
            {@render actionButton(action)}
            {#if i === 0}
              {@render toggle()}
            {/if}
          </div>
        {:else}
          <div class="flex justify-end">
            {@render toggle()}
          </div>
        {/each}
      {/if}
      {#if topPage}
        <ul
          class={[
            "flex flex-col gap-0.5 rounded-field",
            rail && "items-center",
            dragging && zones.top.length === 0 && "min-h-8 bg-primary/8",
          ]}
          ondragover={e => hoverEmpty(e, "top")}
          ondrop={drop}
        >
          {#each zones.top as item, i (item.id)}
            {@render slot("top", item, i, zones.top.length)}
          {/each}
        </ul>
      {/if}
    </nav>
    <Navigator {rail} />
  </section>
  <nav
    class={[
      "island flex shrink-0 gap-0.5 p-1.5",
      rail && "flex-col items-center",
    ]}
    aria-label={m.shell_pages()}
    oncontextmenu={barMenu}
  >
    <ul
      class={["flex min-w-0 flex-1 gap-0.5", rail && "flex-col items-center"]}
      ondragover={e => hoverEmpty(e, "bottom")}
      ondrop={drop}
    >
      {#each zones.bottom as item, i (item.id)}
        {@render slot("bottom", item, i, zones.bottom.length)}
      {/each}
    </ul>
  </nav>
</div>
