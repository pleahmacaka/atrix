<script lang="ts">
import Icon from "@iconify/svelte"
import type { ClassValue } from "svelte/elements"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import MenuLabel from "#lib/components/ui/MenuLabel.svelte"
import Popover from "#lib/components/ui/Popover.svelte"
import SearchField from "#lib/components/ui/SearchField.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { Browse } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { baseName } from "#lib/path.ts"
import { dirsOf, needleOf, recentsOf, startOf } from "./folders.ts"

let {
  host,
  value = $bindable(),
  onpick,
  class: extra,
}: {
  host: HostView | undefined
  value: string
  onpick?: (path: string) => void
  class?: ClassValue
} = $props()

const attempt = new Attempt()

let open = $state(false)

let current = $state<Browse | null>(null)

let filter = $state("")

let requested = ""

const typed = $derived(startOf(filter))

const needle = $derived(needleOf(filter))

const dirs = $derived(dirsOf(current, needle))

const recent = $derived(
  recentsOf(
    [
      ...(host?.state?.open ?? []).map(session => session.cwd),
      ...Object.values(host?.lists ?? {})
        .flat()
        .toSorted((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
        .map(session => session.cwd),
    ],
    needle,
    !!current,
  ),
)

$effect(() => {
  const dir = typed?.dir
  const view = host

  if (!dir || !view || dir === requested) {
    return
  }

  requested = dir
  attempt.run(async () => {
    const found = await view.browse(dir)

    if (requested === dir) {
      current = found
    }
  })
})

const browse = (path: string) =>
  attempt.run(async () => {
    if (host) {
      requested = ""
      current = await host.browse(path)
      filter = ""
    }
  })

const enter = (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
  const text = e.currentTarget.value.trim()

  if (e.key === "Enter" && startOf(text)) {
    e.preventDefault()

    const match = dirs.find(dir => dir.name.toLowerCase() === needle)

    browse(match?.path ?? text)
  }
}

const pick = (path: string) => {
  value = path
  open = false
  onpick?.(path)
}
</script>

<Popover
  label={m.chat_folder()}
  placement="bottom-start"
  width="w-md"
  sheet
  bind:open
>
  {#snippet trigger(p)}
    <button
      {...p}
      type="button"
      class={["btn btn-ghost btn-sm min-w-0 shrink text-sm font-normal", extra ?? "max-w-56"]}
      title={value}
      onclick={() => browse(value)}
    >
      <Icon icon="lucide:folder" class="size-4 shrink-0 opacity-60" />
      <span class="min-w-0 truncate">{baseName(value) || m.chat_folder()}</span>
    </button>
  {/snippet}
  <div class="flex h-80 min-h-0 flex-col gap-1.5 overflow-hidden p-0.5">
    {#if current}
      <div class="flex shrink-0 items-center gap-1">
        <IconButton
          icon="lucide:arrow-up"
          label={m.folder_up()}
          disabled={!current.parent}
          onclick={() => current?.parent && browse(current.parent)}
        />
        <span class="min-w-0 flex-1 truncate font-medium" title={current.path}>
          {current.path}
        </span>
        <button
          type="button"
          class="btn btn-primary btn-sm shrink-0"
          onclick={() => current && pick(current.path)}
        >
          <Icon icon="lucide:check" class="size-4" />
          {m.folder_select()}
        </button>
        <IconButton
          icon="lucide:x"
          label={m.common_close()}
          onclick={() => {
            open = false
          }}
        />
      </div>
      <SearchField
        bind:value={filter}
        onkeydown={enter}
        placeholder={m.folder_filter()}
        class="shrink-0"
        data-autofocus
        {@attach node => node.focus({ preventScroll: true })}
      />
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      {#if recent.length}
        <MenuLabel text={m.folder_recent()} />
        <div role="menu" class="flex flex-col">
          {#each recent as path (path)}
            <MenuItem
              icon="lucide:history"
              label={baseName(path)}
              selected={path.toLowerCase() === value.toLowerCase()}
              title={path}
              onclick={() => pick(path)}
            >
              {#snippet trailing()}
                <span
                  dir="rtl"
                  class="max-w-48 min-w-0 truncate text-xs text-base-content/45"
                >
                  <bdi>{path}</bdi>
                </span>
              {/snippet}
            </MenuItem>
          {/each}
        </div>
      {/if}
      <div role="menu" class="flex flex-col">
        {#each dirs as dir (dir.path)}
          <MenuItem
            icon="lucide:folder"
            label={dir.name}
            onclick={() => browse(dir.path)}
          >
            {#snippet trailing()}
              <Icon icon="lucide:chevron-right" class="size-4 shrink-0 opacity-40" />
            {/snippet}
          </MenuItem>
        {:else}
          {#if !filter.trim() || recent.length === 0}
            <EmptyState
              icon="lucide:folder-x"
              text={filter.trim() ? m.folder_no_match() : m.folder_empty()}
              class="py-6"
            />
          {/if}
        {/each}
      </div>
      </div>
    {/if}
    <ErrorAlert message={attempt.failure} />
  </div>
</Popover>
