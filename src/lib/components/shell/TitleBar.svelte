<script lang="ts">
import Icon from "@iconify/svelte"
import { repoIcon } from "#lib/components/harness/brands.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { logFailure } from "#lib/logging.ts"
import { floatChat, floating, floatOut } from "#lib/p2p/float.svelte.ts"
import { hostById } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { baseName } from "#lib/path.ts"
import { desktop } from "#lib/platform.ts"
import { keyOf } from "#lib/store/keys.ts"
import { nav, openConversation } from "#lib/store/nav.svelte.ts"
import { panes } from "#lib/store/panes.svelte.ts"
import { describe, type Recent, titles } from "#lib/store/recent.ts"
import { shell } from "#lib/store/shell.svelte.ts"
import { withKeys } from "#lib/store/shortcuts.ts"

const info = $derived(describe(panes.active.current))

const split = $derived(panes.leaves.length > 1)

const chat = $derived(panes.active.current?.kind === "chat" ? panes.active.current : null)

const session = $derived(
  panes.active.current?.kind === "session" ? panes.active.current : null,
)

const trigger = $derived(shell.collapsed && !shell.compact && !shell.drawer)

let repo = $state<{ path: string; icon: string } | null>(null)

$effect(() => {
  const path = cwd
  const host = info?.current.kind === "session" ? hostById(info.current.host) : undefined

  if (!path || !host) {
    return
  }

  host
    .git(path)
    .then(git => {
      repo = git ? { path, icon: repoIcon(git.remote) } : null
    })
    .catch(() => {
      repo = null
    })
})

const cwd = $derived(
  info?.current.kind === "session"
    ? hostById(info.current.host)?.views[info.current.id]?.cwd
    : undefined,
)

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

</script>

{#if nav.page === "chat" || trigger || import.meta.env.DEV}
<header
  class="flex h-10 min-w-0 shrink-0 items-center gap-1 px-1.5 select-none"
  data-tauri-drag-region
>
  {#if trigger}
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
    {#if nav.page !== "chat"}
      {null}
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
          <Icon
            icon={repo?.path === cwd ? repo.icon : "lucide:folder"}
            class="size-3 shrink-0 opacity-60"
          />
          <span class="min-w-0 truncate">{baseName(cwd)}</span>
        </span>
      {/if}
    {/if}
  </div>
  {#if desktop && nav.page === "chat" && !split && session && !floating.has(keyOf(session))}
    {@const target = session}
    <IconButton
      icon="lucide:picture-in-picture-2"
      label={m.float_out()}
      class="shrink-0"
      onclick={() => floatOut(target, info?.title ?? "")}
    />
  {:else if desktop && nav.page === "chat" && !split && chat && !floating.has(chat.id)}
    {@const target = chat}
    <IconButton
      icon="lucide:picture-in-picture-2"
      label={m.float_out()}
      class="shrink-0"
      onclick={() => floatChat(target.id, info?.title ?? "")}
    />
  {/if}
  {#if nav.page === "chat" && !split}
    <IconButton
      icon={panes.hasSide() ? "lucide:panel-right-close" : "lucide:panel-right-open"}
      label={m.shell_side_panel()}
      aria-pressed={panes.hasSide()}
      class="shrink-0"
      onclick={() => panes.toggleSide()}
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
</header>
{/if}
