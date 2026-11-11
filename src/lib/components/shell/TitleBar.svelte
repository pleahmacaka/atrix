<script lang="ts">
import Icon from "@iconify/svelte"
import { onMount } from "svelte"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { nav, openConversation, setSidebar } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import { describe } from "#lib/store/recent.ts"

const info = $derived(
  panes.leaves.length === 1 ? describe(panes.active.current) : undefined,
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
  class="group flex h-10 shrink-0 items-center gap-1 ps-2 select-none"
  data-tauri-drag-region
>
  {#if !nav.sidebar}
    <button
      type="button"
      class={[
        "btn btn-ghost btn-sm btn-square transition-opacity",
        "lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100",
      ]}
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
  {#if nav.page === "harness"}
    <span class="pointer-events-none flex items-center gap-2 px-2 text-sm">
      <Icon icon="lucide:boxes" class="size-4 opacity-60" />
      {m.common_harnesses()}
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
  {#if nav.page === "chat"}
    <div
      class={[
        "flex items-center gap-0.5 transition-opacity",
        "lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100",
      ]}
    >
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
    <div class="ms-1 flex h-full items-stretch">
      <button
        type="button"
        class="grid w-12 cursor-pointer place-items-center hover:bg-base-content/10"
        aria-label={m.shell_minimize()}
        onclick={() => win().then(w => w.minimize())}
      >
        <Icon icon="lucide:minus" class="size-4" />
      </button>
      <button
        type="button"
        class="grid w-12 cursor-pointer place-items-center hover:bg-base-content/10"
        aria-label={maximized ? m.shell_restore() : m.shell_maximize()}
        onclick={() => win().then(w => w.toggleMaximize())}
      >
        <Icon icon={maximized ? "lucide:copy" : "lucide:square"} class="size-3.5" />
      </button>
      <button
        type="button"
        class={[
          "grid w-12 cursor-pointer place-items-center",
          "hover:bg-error hover:text-error-content",
        ]}
        aria-label={m.common_close()}
        onclick={() => win().then(w => w.close())}
      >
        <Icon icon="lucide:x" class="size-4" />
      </button>
    </div>
  {:else}
    <span class="w-2"></span>
  {/if}
</header>
