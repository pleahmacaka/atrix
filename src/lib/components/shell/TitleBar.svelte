<script lang="ts">
import Icon from "@iconify/svelte"
import { onMount } from "svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import Popover from "#lib/components/ui/Popover.svelte"
import Separator from "#lib/components/ui/Separator.svelte"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { nav, openConversation } from "#lib/store/nav.svelte.ts"
import { APPS_PAGE, PAGES } from "#lib/store/pages.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import { describe, titles } from "#lib/store/recent.ts"
import { shell } from "#lib/store/shell.svelte.ts"
import { keysOf, type ShortcutId, withKeys } from "#lib/store/shortcuts.ts"

type Action = {
  label: string
  icon: string
  shortcut: ShortcutId
  disabled: boolean
  run: () => void
}

const info = $derived(
  panes.leaves.length === 1 ? describe(panes.active.current) : undefined,
)

const page = $derived(
  nav.page === "chat"
    ? null
    : [...PAGES, APPS_PAGE].find(p => p.id === nav.page),
)

const actions: Action[] = $derived(
  nav.page === "chat"
    ? [
        {
          label: m.shell_split_right(),
          icon: "lucide:columns-2",
          shortcut: "splitRight",
          disabled: !panes.canSplit(panes.active.id, "right"),
          run: () => panes.split(panes.active.id, "right"),
        },
        {
          label: m.shell_split_down(),
          icon: "lucide:rows-2",
          shortcut: "splitDown",
          disabled: !panes.canSplit(panes.active.id, "bottom"),
          run: () => panes.split(panes.active.id, "bottom"),
        },
      ]
    : [],
)

let maximized = $state(false)

let more = $state(false)

let renaming = $state(false)

const rename = (key: string, value: string) => {
  renaming = false
  titles.set(key, value.trim())
}

const win = () =>
  import("@tauri-apps/api/window").then(m => m.getCurrentWindow())

onMount(() => {
  if (!desktop) {
    return
  }

  let unlisten = () => {}

  win().then(async w => {
    maximized = await w.isMaximized()
    unlisten = await w.onResized(async () => {
      maximized = await w.isMaximized()
    })
  })

  return () => unlisten()
})
</script>

<header
  class="flex h-12 min-w-0 shrink-0 items-center gap-1 px-2 select-none"
  data-tauri-drag-region
>
  {#if !shell.docked && !shell.drawer}
    <IconButton
      icon="lucide:panel-left-open"
      label={m.shell_expand_sidebar()}
      title={withKeys(m.shell_expand_sidebar(), "sidebar")}
      class="shrink-0"
      data-sidebar-trigger
      onclick={shell.toggle}
    />
  {/if}
  <div class="flex h-full min-w-0 flex-1 items-center" data-tauri-drag-region>
    {#if page}
      <span
        class="pointer-events-none inline-flex h-8 min-w-0 items-center gap-1.5 px-3 text-sm"
      >
        <Icon icon={page.icon} class="size-4 shrink-0 opacity-70" />
        <span class="min-w-0 truncate">{page.label()}</span>
      </span>
    {:else if info && renaming}
      {@const key = info.key}
      <input
        class="input input-sm w-80 max-w-full min-w-0"
        aria-label={m.menu_rename()}
        value={info.title}
        {@attach node => node.select()}
        onblur={e => rename(key, e.currentTarget.value)}
        onkeydown={e => {
          if (e.key === "Enter") {
            rename(key, e.currentTarget.value)
          } else if (e.key === "Escape") {
            renaming = false
          }
        }}
      />
    {:else if info}
      <button
        type="button"
        class="btn btn-ghost btn-sm max-w-full min-w-0 shrink justify-start font-normal"
        title={m.menu_rename()}
        onclick={() => {
          renaming = true
        }}
      >
        <Icon icon={info.icon} class="size-4 shrink-0 opacity-70" />
        <span class="min-w-0 truncate">{info.title}</span>
      </button>
    {/if}
  </div>
  <div class="flex shrink-0 items-center gap-0.5 max-sm:hidden">
    {#each actions as action (action.icon)}
      <IconButton
        icon={action.icon}
        label={action.label}
        title={withKeys(action.label, action.shortcut)}
        disabled={action.disabled}
        onclick={action.run}
      />
    {/each}
  </div>
  <div class="shrink-0 sm:hidden">
    <Popover label={m.shell_more()} placement="bottom-end" width="w-60" bind:open={more}>
      {#snippet trigger(p)}
        <IconButton {...p} icon="lucide:ellipsis" label={m.shell_more()} />
      {/snippet}
      <div role="menu" class="flex flex-col">
        {#each actions as action (action.icon)}
          <MenuItem
            icon={action.icon}
            label={action.label}
            hint={keysOf(action.shortcut)}
            disabled={action.disabled}
            onclick={() => {
              more = false
              action.run()
            }}
          />
        {/each}
      </div>
    </Popover>
  </div>
  {#if nav.page === "chat"}
    <IconButton
      icon="lucide:square-pen"
      label={m.chat_new()}
      title={withKeys(m.chat_new(), "new")}
      class="shrink-0"
      onclick={() => openConversation(null)}
    />
  {/if}
  {#if desktop}
    <Separator vertical />
    <div class="flex shrink-0 items-center gap-0.5">
      <IconButton
        icon="lucide:minus"
        label={m.shell_minimize()}
        onclick={() => win().then(w => w.minimize())}
      />
      <IconButton
        icon={maximized ? "lucide:copy" : "lucide:square"}
        label={maximized ? m.shell_restore() : m.shell_maximize()}
        onclick={() => win().then(w => w.toggleMaximize())}
      />
      <IconButton
        icon="lucide:x"
        label={m.common_close()}
        class="hover:bg-error hover:text-error-content"
        onclick={() => win().then(w => w.close())}
      />
    </div>
  {/if}
</header>
