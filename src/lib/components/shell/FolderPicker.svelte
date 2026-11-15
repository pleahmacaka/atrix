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

let {
  host,
  value = $bindable(),
  class: extra,
}: { host: HostView | undefined; value: string; class?: ClassValue } = $props()

const RECENT_LIMIT = 6

const RECENT_BROWSING = 3

const attempt = new Attempt()

let open = $state(false)

let current = $state<Browse | null>(null)

let filter = $state("")

const dirs = $derived(
  (current?.dirs ?? []).filter(d =>
    d.name.toLowerCase().includes(filter.trim().toLowerCase()),
  ),
)

const recent = $derived(
  [
    ...new Set([
      ...(host?.state?.open ?? []).map(s => s.cwd),
      ...Object.values(host?.lists ?? {})
        .flat()
        .toSorted((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
        .map(s => s.cwd),
    ]),
  ]
    .filter(
      path =>
        !!path && baseName(path).toLowerCase().includes(filter.trim().toLowerCase()),
    )
    .slice(0, current ? RECENT_BROWSING : RECENT_LIMIT),
)

const browse = (path: string) =>
  attempt.run(async () => {
    if (host) {
      current = await host.browse(path)
      filter = ""
    }
  })

const pick = (path: string) => {
  value = path
  open = false
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
      <Icon icon="lucide:chevron-down" class="size-4 shrink-0 opacity-60" />
    </button>
  {/snippet}
  <div class="flex h-112 flex-col gap-1.5 p-0.5">
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
        <IconButton
          icon="lucide:check"
          label={m.folder_select()}
          tone="primary"
          onclick={() => current && pick(current.path)}
        />
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
        placeholder={m.folder_filter()}
        class="shrink-0"
        data-autofocus
        {@attach node => node.focus({ preventScroll: true })}
      />
      <div role="menu" class="flex min-h-40 flex-1 flex-col overflow-y-auto">
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
    {/if}
    {#if recent.length}
      <MenuLabel text={m.folder_recent()} class="shrink-0" />
      <div role="menu" class="flex shrink-0 flex-col">
        {#each recent as path (path)}
          <MenuItem
            icon="lucide:history"
            label={baseName(path)}
            selected={path === value}
            title={path}
            onclick={() => pick(path)}
          >
            {#snippet trailing()}
              <span class="max-w-40 min-w-0 truncate text-xs text-base-content/45">
                {path}
              </span>
            {/snippet}
          </MenuItem>
        {/each}
      </div>
    {/if}
    <ErrorAlert message={attempt.failure} />
  </div>
</Popover>
