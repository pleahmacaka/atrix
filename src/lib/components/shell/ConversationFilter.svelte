<script lang="ts">
import { uniqBy } from "es-toolkit"
import { brandIcon } from "#lib/components/harness/brands.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import MenuLabel from "#lib/components/ui/MenuLabel.svelte"
import Popover from "#lib/components/ui/Popover.svelte"
import SearchField from "#lib/components/ui/SearchField.svelte"
import { hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import {
  type KindFilter,
  type SortKey,
  type StatusFilter,
  sessionFilter,
} from "#lib/store/sessionFilter.svelte.ts"

const harnesses = $derived(
  uniqBy(
    hostList().flatMap(h =>
      (h.view.state?.harnesses ?? [])
        .filter(x => x.enabled)
        .map(x => ({ id: x.id, name: x.name, base: x.base })),
    ),
    x => x.id,
  ),
)

const SEARCH_FROM = 6

let query = $state("")

const found = $derived(
  harnesses.filter(h => h.name.toLowerCase().includes(query.trim().toLowerCase())),
)

const KINDS: { id: KindFilter; label: () => string; icon: string }[] = [
  { id: "all", label: m.filter_all, icon: "lucide:layers" },
  { id: "chat", label: m.filter_chats, icon: "lucide:message-square" },
  { id: "session", label: m.filter_sessions, icon: "lucide:terminal" },
]

const STATUSES: { id: StatusFilter; label: () => string; icon: string }[] = [
  { id: "all", label: m.filter_all, icon: "lucide:circle-dashed" },
  { id: "running", label: m.filter_running, icon: "lucide:loader" },
  { id: "unread", label: m.filter_unread, icon: "lucide:circle-dot" },
  { id: "open", label: m.filter_open, icon: "lucide:circle-check" },
]

const SORTS: { id: SortKey; label: () => string; icon: string }[] = [
  { id: "activity", label: m.sort_activity, icon: "lucide:clock" },
  { id: "title", label: m.sort_title_name, icon: "lucide:arrow-down-a-z" },
  { id: "status", label: m.sort_status, icon: "lucide:activity" },
]
</script>

<div class="flex items-center gap-0.5">
  <Popover label={m.filter_title()} placement="right" width="w-64" sheet>
    {#snippet trigger(p)}
      <IconButton
        {...p}
        icon="lucide:list-filter"
        label={m.filter_title()}
        size="xs"
        class={["relative", sessionFilter.active && "text-primary"]}
      >
        {#if sessionFilter.active}
          <span class="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary"></span>
        {/if}
      </IconButton>
    {/snippet}
    <div role="menu" class="flex flex-col">
      <div class="flex min-h-8 items-center gap-2 ps-2">
        <p class="min-w-0 flex-1 truncate text-xs font-medium text-base-content/50">
          {m.filter_kind()}
        </p>
        {#if sessionFilter.active}
          <IconButton
            icon="lucide:filter-x"
            label={m.filter_reset()}
            size="xs"
            onclick={sessionFilter.reset}
          />
        {/if}
      </div>
      {#each KINDS as kind (kind.id)}
        {@const selected = sessionFilter.value.kind === kind.id}
        <MenuItem
          icon={kind.icon}
          label={kind.label()}
          {selected}
          checked={selected}
          onclick={() => sessionFilter.set({ kind: kind.id })}
        />
      {/each}
      <MenuLabel text={m.filter_status()} />
      {#each STATUSES as status (status.id)}
        {@const selected = sessionFilter.value.status === status.id}
        <MenuItem
          icon={status.icon}
          label={status.label()}
          {selected}
          checked={selected}
          onclick={() => sessionFilter.set({ status: status.id })}
        />
      {/each}
      {#if harnesses.length}
        <MenuLabel text={m.filter_harness()} />
        {#if harnesses.length > SEARCH_FROM}
          <SearchField bind:value={query} class="mx-1 mb-1" />
        {/if}
        <div class="flex max-h-48 flex-col overflow-y-auto">
          {#each found as h (h.id)}
            {@const selected = sessionFilter.value.harness === h.id}
            <MenuItem
              icon={brandIcon(h.base)}
              label={h.name}
              {selected}
              checked={selected}
              onclick={() => sessionFilter.set({ harness: selected ? null : h.id })}
            />
          {:else}
            <MenuItem label={m.common_no_results()} disabled />
          {/each}
        </div>
      {/if}
    </div>
  </Popover>
  <Popover label={m.sort_title()} placement="bottom-end" width="w-52" sheet>
    {#snippet trigger(p)}
      <IconButton {...p} icon="lucide:arrow-up-down" label={m.sort_title()} size="xs" />
    {/snippet}
    <div role="menu" class="flex flex-col">
      {#each SORTS as sort (sort.id)}
        {@const selected = sessionFilter.value.sort === sort.id}
        <MenuItem
          icon={sort.icon}
          label={sort.label()}
          {selected}
          checked={selected}
          onclick={() => sessionFilter.set({ sort: sort.id })}
        />
      {/each}
    </div>
  </Popover>
</div>
