<script lang="ts">
import Icon from "@iconify/svelte"
import { onMount } from "svelte"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { nav, openConversation, setSidebar } from "#lib/store/nav.svelte.ts"
import { APPS_PAGE, PAGES } from "#lib/store/pages.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import { describe } from "#lib/store/recent.ts"
import { layout } from "#lib/widgets/layout.svelte.ts"

const info = $derived(
  panes.leaves.length === 1 ? describe(panes.active.current) : undefined,
)

const page = $derived(
  nav.page === "chat"
    ? null
    : [...PAGES, APPS_PAGE].find(p => p.id === nav.page),
)

let maximized = $state(false)

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
  class={[
    "flex h-12 shrink-0 items-center gap-1 px-2",
    "select-none",
  ]}
  data-tauri-drag-region
>
  {#if !nav.sidebar}
    <button
      type="button"
      class="btn btn-ghost btn-sm btn-square"
      aria-label={m.shell_expand_sidebar()}
      title="{m.shell_expand_sidebar()} (Ctrl+B)"
      onclick={() => setSidebar(true)}
      onpointerenter={() => {
        if (matchMedia("(pointer: fine)").matches) {
          nav.peek = true
        }
      }}
    >
      <Icon icon="lucide:panel-left-open" class="size-4" />
    </button>
  {/if}
  {#if page}
    <span class="pointer-events-none flex items-center gap-2 px-2 text-sm">
      <Icon icon={page.icon} class="size-4 opacity-60" />
      {page.label()}
    </span>
  {:else if info}
    <button
      type="button"
      class="btn btn-ghost btn-sm min-w-0 font-normal"
      title={m.shell_switch()}
      onclick={() => {
        nav.palette = true
      }}
    >
      <Icon icon={info.icon} class="size-4 shrink-0 opacity-70" />
      <span class="min-w-0 truncate">{info.title}</span>
      <span class="truncate text-xs text-base-content/50 max-sm:hidden">
        {info.source}
      </span>
    </button>
  {/if}
  <span class="h-full flex-1" data-tauri-drag-region></span>
  <button
    type="button"
    class={["btn btn-ghost btn-sm btn-square", layout.editing && "text-primary"]}
    aria-label={m.widget_edit()}
    aria-pressed={layout.editing}
    title="{m.widget_edit()} (Ctrl+E)"
    onclick={() => {
      layout.editing = !layout.editing
    }}
  >
    <Icon icon="lucide:layout-dashboard" class="size-4" />
  </button>
  {#if nav.page === "chat"}
    <div class="flex items-center gap-0.5">
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label={m.shell_split_right()}
        title="{m.shell_split_right()} (Ctrl+\)"
        onclick={() => panes.split(panes.active.id, "right")}
      >
        <Icon icon="lucide:columns-2" class="size-4" />
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label={m.shell_split_down()}
        title="{m.shell_split_down()} (Ctrl+Shift+\)"
        onclick={() => panes.split(panes.active.id, "bottom")}
      >
        <Icon icon="lucide:rows-2" class="size-4" />
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label={m.chat_new()}
        title="{m.chat_new()} (Ctrl+N)"
        onclick={() => openConversation(null)}
      >
        <Icon icon="lucide:square-pen" class="size-4" />
      </button>
    </div>
  {/if}
  {#if desktop}
    {#if nav.page === "chat"}
      <span class="mx-1.5 h-5 w-px bg-base-300"></span>
    {/if}
    <div class="flex items-center gap-0.5">
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label={m.shell_minimize()}
        title={m.shell_minimize()}
        onclick={() => win().then(w => w.minimize())}
      >
        <Icon icon="lucide:minus" class="size-4" />
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label={maximized ? m.shell_restore() : m.shell_maximize()}
        title={maximized ? m.shell_restore() : m.shell_maximize()}
        onclick={() => win().then(w => w.toggleMaximize())}
      >
        <Icon icon={maximized ? "lucide:copy" : "lucide:square"} class="size-3.5" />
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square hover:bg-error hover:text-error-content"
        aria-label={m.common_close()}
        title={m.common_close()}
        onclick={() => win().then(w => w.close())}
      >
        <Icon icon="lucide:x" class="size-4" />
      </button>
    </div>
  {/if}
</header>
