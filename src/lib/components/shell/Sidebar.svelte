<script lang="ts">
import Icon from "@iconify/svelte"
import { z } from "zod"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { tooltip } from "#lib/components/ui/tooltip.ts"
import { screen } from "#lib/lock/lock.svelte.ts"
import { floatSidebar } from "#lib/p2p/float.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { startNewChatDrag } from "#lib/store/drag.ts"
import { goPage, nav, openConversation, openSettings } from "#lib/store/nav.svelte.ts"
import { APPS_PAGE, CALENDAR_PAGE, PAGES, SETTINGS_PAGE } from "#lib/store/pages.ts"
import { shell } from "#lib/store/shell.svelte.ts"
import { type ShortcutId, withKeys } from "#lib/store/shortcuts.ts"
import { Stored } from "#lib/store/stored.svelte.ts"
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

const chatActions = (): Action[] => [
  {
    label: m.chat_new(),
    icon: "lucide:square-pen",
    shortcut: "new",
    drag: startNewChatDrag,
    run: () => {
      goPage("chat")
      openConversation(null)
    },
  },
  {
    label: m.common_search(),
    icon: "lucide:search",
    shortcut: "palette",
    run: () => {
      nav.palette = true
    },
  },
]

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
  apps: () => [],
  settings: () => [],
}

const actions: Action[] = $derived((PAGE_ACTIONS[nav.page] ?? chatActions)())

const order = new Stored("order:", [] as string[], z.array(z.string()))

const rank = (id: string) => {
  const at = order.get("pages").indexOf(id)

  return at === -1 ? Number.MAX_SAFE_INTEGER : at
}

let dragging = $state<string | null>(null)

let hint = $state<{ id: string; after: boolean } | null>(null)

const hover = (e: DragEvent, id: string) => {
  if (!dragging) {
    return
  }

  e.preventDefault()

  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const after = rail ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2

  hint = { id, after }
}

const drop = () => {
  if (dragging && hint && dragging !== hint.id) {
    const ids = pages.map(p => p.id).filter(id => id !== dragging)
    const at = ids.indexOf(hint.id) + (hint.after ? 1 : 0)

    order.set("pages", ids.toSpliced(at, 0, dragging))
  }

  dragging = null
  hint = null
}

const pages = $derived([
  ...[...PAGES, CALENDAR_PAGE, APPS_PAGE].map(page => ({
    id: page.id as string,
    label: page.label(),
    icon: page.icon,
    active: nav.page === page.id,
    run: () => {
      goPage(page.id)

      if (rail && page.id !== "chat" && page.id !== "apps") {
        shell.openDrawer()
      }
    },
  })),
  {
    id: "settings",
    label: SETTINGS_PAGE.label(),
    icon: SETTINGS_PAGE.icon,
    active: nav.settingsOpen,
    run: () => openSettings(nav.settingsTab),
  },
  {
    id: "lock",
    label: m.lock_now(),
    icon: "lucide:lock",
    active: false,
    run: screen.lock,
  },
].toSorted((a, b) => rank(a.id) - rank(b.id)))

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

{#snippet actionButton(action: Action)}
  <button
    type="button"
    class={[
      "flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-field text-sm",
      "transition-colors duration-140 hover:bg-base-content/8",
      rail ? "w-8 justify-center" : "flex-1 px-2",
      action.pressed && "bg-primary/8 text-primary hover:bg-primary/8",
    ]}
    aria-label={action.label}
    aria-pressed={action.pressed}
    {@attach tooltip(() => hintOf(action), () => rail)}
    draggable={!!action.drag}
    ondragstart={action.drag}
    onclick={action.run}
  >
    <Icon icon={action.icon} class="size-4 shrink-0" />
    {#if !rail}
      <span class="min-w-0 flex-1 truncate text-start">{action.label}</span>
    {/if}
  </button>
{/snippet}

<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2 select-none" data-sidebar>
  <section class="island flex min-h-0 flex-1 flex-col overflow-hidden">
    <nav
      class={["flex shrink-0 flex-col gap-0.5", rail ? "items-center p-1.5" : "p-2"]}
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
    </nav>
    <Navigator {rail} />
  </section>
  <nav
    class={["island flex shrink-0 gap-0.5 p-1.5", rail && "flex-col items-center"]}
    aria-label={m.shell_pages()}
  >
    <ul class="contents">
    {#each pages as page (page.id)}
      <li
        class={["relative flex", !rail && "min-w-0 flex-1", dragging === page.id && "opacity-40"]}
        draggable="true"
        ondragstart={e => {
          dragging = page.id
          e.dataTransfer?.setData("text/plain", page.id)
        }}
        ondragover={e => hover(e, page.id)}
        ondrop={e => {
          e.preventDefault()
          drop()
        }}
        ondragend={() => {
          dragging = null
          hint = null
        }}
      >
        {#if hint?.id === page.id && dragging !== page.id}
          <span
            class={[
              "pointer-events-none absolute z-10 rounded-full bg-primary",
              rail
                ? ["inset-x-1 h-0.5", hint.after ? "-bottom-0.5" : "-top-0.5"]
                : ["inset-y-1 w-0.5", hint.after ? "-right-0.5" : "-left-0.5"],
            ]}
          ></span>
        {/if}
        <IconButton
        icon={page.icon}
        label={page.label}
        title={null}
        shape={rail ? "square" : "wide"}
        class={[
          "transition-colors duration-140",
          !rail && "min-w-0 flex-1 px-0",
          page.active && "bg-primary/8 text-primary hover:bg-primary/8",
        ]}
        aria-current={page.active && page.id !== "settings" ? "page" : undefined}
        {@attach tooltip(() => page.label)}
        onclick={page.run}
      />
      </li>
    {/each}
    </ul>
  </nav>
</div>
