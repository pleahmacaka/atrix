<script lang="ts">
import Icon from "@iconify/svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import MenuLabel from "#lib/components/ui/MenuLabel.svelte"
import { menuKeys } from "#lib/components/ui/menu.ts"
import Popover, {
  type PopoverTrigger,
} from "#lib/components/ui/Popover.svelte"
import Separator from "#lib/components/ui/Separator.svelte"
import { m } from "#lib/paraglide/messages.js"
import { GROUP_BY_LABELS, SORT_LABELS, VIEW_LABELS } from "../../labels"
import { THIS_PC } from "../../locations"
import {
  COMMANDS,
  type CommandId,
  hintOf,
  usable,
} from "../../store/commands"
import type { Explorer } from "../../store/explorer.svelte"
import { NETWORK_ACTIONS } from "../../store/menus"
import {
  GROUP_KEYS,
  prefs,
  SORT_KEYS,
  VIEW_ICONS,
  VIEWS,
} from "../../store/prefs.svelte"
import CommandButton from "./CommandButton.svelte"

let { explorer, compact = false }: { explorer: Explorer; compact?: boolean } =
  $props()

const EDIT: CommandId[] = ["cut", "copy", "paste", "rename", "delete"]

const SELECTION: CommandId[] = ["selectAll", "selectNone", "invertSelection"]

const OTHERS: CommandId[] = ["properties", "newWindow", "settings"]

let sortOpen = $state(false)

let viewOpen = $state(false)

let moreOpen = $state(false)

const more = $derived(
  prefs.selectionInMore || compact ? [SELECTION, OTHERS] : [OTHERS],
)

const folder = $derived(explorer.folder)

const closeAll = () => {
  sortOpen = false
  viewOpen = false
  moreOpen = false
}

const pick = (run: () => unknown) => () => {
  closeAll()
  run()
}
</script>

{#snippet command(id: CommandId)}
  <MenuItem
    icon={COMMANDS[id].icon}
    label={COMMANDS[id].label()}
    hint={hintOf(id)}
    disabled={!usable(id, explorer)}
    onclick={pick(() => COMMANDS[id].run(explorer))}
  />
{/snippet}

{#snippet menuButton(
  p: PopoverTrigger,
  icon: string,
  label: string,
  disabled: boolean,
)}
  <button
    {...p}
    type="button"
    class="btn btn-ghost btn-sm shrink-0 gap-2 px-2.5 font-normal"
    {disabled}
  >
    <Icon {icon} class="size-4 shrink-0" />
    <span class="whitespace-nowrap">{label}</span>
    <Icon icon="lucide:chevron-down" class="size-3.5 shrink-0 opacity-60" />
  </button>
{/snippet}

{#snippet moreMenu()}
  <Popover
    label={m.files_commands_more()}
    placement="bottom-end"
    width="w-64"
    bind:open={moreOpen}
  >
    {#snippet trigger(p)}
      <IconButton
        {...p}
        icon="lucide:ellipsis"
        label={m.files_commands_more()}
        class="shrink-0"
      />
    {/snippet}
    <div role="menu" tabindex="-1" class="flex flex-col" {@attach menuKeys}>
      {#if explorer.tab.location === THIS_PC}
        {#each NETWORK_ACTIONS as entry (entry.key)}
          <MenuItem
            icon={entry.icon}
            label={entry.label()}
            onclick={pick(() => explorer.changePlaces(entry.run))}
          />
        {/each}
        <hr class="my-1 border-0" />
      {/if}
      {#each more as group, index (index)}
        {#if index > 0}
          <hr class="my-1 border-0" />
        {/if}
        {#each group as id (id)}
          {@render command(id)}
        {/each}
      {/each}
    </div>
  </Popover>
{/snippet}

{#if compact}
  <CommandButton id="preview" {explorer} pressed={prefs.preview} />
  {@render moreMenu()}
{:else}
  <div class="flex shrink-0 items-center gap-1 px-2 pb-2">
    {#if explorer.inBin}
      <CommandButton id="emptyBin" {explorer} text />
      <CommandButton id="restore" {explorer} text />
    {:else}
      <CommandButton id="newFolder" {explorer} text />
    {/if}

    <Separator vertical />

    {#each EDIT as id (id)}
      <CommandButton {id} {explorer} />
    {/each}

    <Separator vertical />

    <Popover
      label={m.files_commands_sort()}
      width="w-60"
      bind:open={sortOpen}
    >
      {#snippet trigger(p)}
        {@render menuButton(
          p,
          "lucide:arrow-up-down",
          m.files_commands_sort(),
          !explorer.arrangeable,
        )}
      {/snippet}
      <div role="menu" tabindex="-1" class="flex flex-col" {@attach menuKeys}>
        {#each SORT_KEYS as key (key)}
          <MenuItem
            label={SORT_LABELS[key]()}
            checked={folder.sort === key}
            onclick={pick(() => explorer.setSort(key, folder.ascending))}
          />
        {/each}
        <hr class="my-1 border-0" />
        <MenuItem
          icon="lucide:arrow-up-narrow-wide"
          label={m.files_sort_ascending()}
          checked={folder.ascending}
          onclick={pick(() => explorer.setSort(folder.sort, true))}
        />
        <MenuItem
          icon="lucide:arrow-down-wide-narrow"
          label={m.files_sort_descending()}
          checked={!folder.ascending}
          onclick={pick(() => explorer.setSort(folder.sort, false))}
        />
        <MenuLabel text={m.files_groups_title()} />
        {#each GROUP_KEYS as key (key)}
          <MenuItem
            label={GROUP_BY_LABELS[key]()}
            checked={explorer.group === key}
            onclick={pick(() => explorer.setGroup(key))}
          />
        {/each}
      </div>
    </Popover>

    <Popover
      label={m.files_commands_view()}
      width="w-64"
      bind:open={viewOpen}
    >
      {#snippet trigger(p)}
        {@render menuButton(
          p,
          VIEW_ICONS[explorer.view],
          m.files_commands_view(),
          false,
        )}
      {/snippet}
      <div role="menu" tabindex="-1" class="flex flex-col" {@attach menuKeys}>
        {#each VIEWS as view (view)}
          <MenuItem
            icon={VIEW_ICONS[view]}
            label={VIEW_LABELS[view]()}
            hint={hintOf(`view.${view}`)}
            checked={explorer.view === view}
            disabled={!explorer.arrangeable}
            onclick={pick(() => explorer.setView(view))}
          />
        {/each}
        <hr class="my-1 border-0" />
        <MenuItem
          icon="lucide:calendar"
          label={m.files_views_date_groups()}
          checked={explorer.group === "modified"}
          disabled={!explorer.arrangeable}
          onclick={() => explorer.toggleDateGroups()}
        />
        <MenuItem
          icon="lucide:folder-cog"
          label={m.files_views_folder_only()}
          checked={!!explorer.own}
          disabled={!explorer.arrangeable}
          onclick={() => explorer.toggleFolderOnly()}
        />
        <MenuItem
          icon="lucide:eye"
          label={m.files_views_hidden()}
          checked={prefs.showHidden}
          onclick={() => (prefs.showHidden = !prefs.showHidden)}
        />
        <MenuItem
          icon="lucide:file-type"
          label={m.files_views_extensions()}
          checked={prefs.showExtensions}
          onclick={() => (prefs.showExtensions = !prefs.showExtensions)}
        />
      </div>
    </Popover>

    <div class="min-w-0 flex-1"></div>

    {#if !prefs.selectionInMore}
      {#each SELECTION as id (id)}
        <CommandButton {id} {explorer} />
      {/each}
    {/if}

    <CommandButton id="preview" {explorer} pressed={prefs.preview} />

    {@render moreMenu()}
  </div>
{/if}
