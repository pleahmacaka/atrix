<script lang="ts">
import Icon from "@iconify/svelte"
import { onMount } from "svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Separator from "#lib/components/ui/Separator.svelte"
import { logFailure } from "#lib/logging.ts"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { baseName } from "#lib/path.ts"
import { desktop } from "#lib/platform.ts"
import { nav, openConversation } from "#lib/store/nav.svelte.ts"
import { APPS_PAGE, CALENDAR_PAGE, PAGES, SETTINGS_PAGE } from "#lib/store/pages.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import { describe, type Recent, titles } from "#lib/store/recent.ts"
import { shell } from "#lib/store/shell.svelte.ts"
import { withKeys } from "#lib/store/shortcuts.ts"

const info = $derived(
  panes.leaves.length === 1 ? describe(panes.active.current) : undefined,
)

const page = $derived(
  nav.page === "chat"
    ? null
    : [...PAGES, APPS_PAGE, CALENDAR_PAGE, SETTINGS_PAGE].find(p => p.id === nav.page),
)

const cwd = $derived(
  info?.current.kind === "session"
    ? hostById(info.current.host)?.views[info.current.id]?.cwd
    : undefined,
)

let maximized = $state(false)

let renaming = $state(false)

const rename = (current: Recent["current"], key: string, value: string) => {
  const title = value.trim()

  renaming = false
  titles.set(key, title)

  if (title && current.kind === "session") {
    hostById(current.host)
      ?.rename(current.id, title)
      .catch((e: unknown) => logFailure("session rename", e))
  }
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
  class="flex h-10 min-w-0 shrink-0 items-center gap-1 px-1.5 select-none"
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
      {@const { key, current } = info}
      <input
        class="input input-sm w-80 max-w-full min-w-0"
        aria-label={m.menu_rename()}
        value={info.title}
        {@attach node => node.select()}
        onblur={e => rename(current, key, e.currentTarget.value)}
        onkeydown={e => {
          if (e.key === "Enter") {
            rename(current, key, e.currentTarget.value)
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
      {#if cwd}
        <span
          class="badge badge-soft badge-primary badge-sm ms-2 max-w-40 min-w-0 shrink-0 gap-1"
          title={cwd}
        >
          <Icon icon="lucide:folder" class="size-3 shrink-0 opacity-60" />
          <span class="min-w-0 truncate">{baseName(cwd)}</span>
        </span>
      {/if}
    {/if}
  </div>
  {#if nav.page === "chat"}
    <IconButton
      icon={shell.side ? "lucide:panel-right-close" : "lucide:panel-right-open"}
      label={m.shell_side_panel()}
      aria-pressed={shell.side}
      class="shrink-0"
      onclick={shell.toggleSide}
    />
  {/if}
  {#if nav.page === "chat"}
    <IconButton
      icon="lucide:square-pen"
      label={m.chat_new()}
      title={withKeys(m.chat_new(), "new")}
      class="shrink-0"
      onclick={() => openConversation(null)}
    />
  {/if}
  {#if import.meta.env.DEV}
    <span class="badge badge-warning badge-sm shrink-0">{m.shell_dev_build()}</span>
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
