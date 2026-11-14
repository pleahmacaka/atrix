<script lang="ts">
import Icon from "@iconify/svelte"
import IconInput from "#lib/components/ui/IconInput.svelte"
import { m } from "#lib/paraglide/messages.js"

let {
  icon,
  label,
  entries,
  valid,
  onchange,
}: {
  icon: string
  label: string
  entries: string[]
  valid: (entry: string) => boolean | Promise<boolean>
  onchange: (entries: string[]) => void
} = $props()

let draft = $state("")

let invalid = $state(false)

const add = async () => {
  const entry = draft.trim()

  invalid = !(await valid(entry))

  if (invalid) {
    return
  }

  draft = ""

  if (!entries.includes(entry)) {
    onchange([...entries, entry])
  }
}
</script>

<div class="flex flex-col gap-2 pb-3">
  <form
    class="flex gap-2"
    onsubmit={e => {
      e.preventDefault()
      add()
    }}
  >
    <IconInput
      {icon}
      {label}
      ghost={false}
      class="flex-1"
      placeholder={label}
      oninput={() => {
        invalid = false
      }}
      bind:value={draft}
    />
    <button type="submit" class="btn btn-sm" disabled={!draft.trim()}>
      <Icon icon="lucide:plus" class="size-4" />
      {m.tailnet_add()}
    </button>
  </form>
  {#if invalid}
    <p class="flex items-center gap-2 text-xs text-error">
      <Icon icon="lucide:circle-alert" class="size-4" />
      {m.tailnet_bad_address()}
    </p>
  {/if}
  <ul class="flex flex-col gap-1 text-sm">
    {#each entries as entry (entry)}
      <li class="flex items-center gap-2 rounded-field px-2 py-1 hover:bg-base-200">
        <Icon {icon} class="size-4 text-base-content/60" />
        <span class="min-w-0 flex-1 truncate tabular-nums">{entry}</span>
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square"
          aria-label={m.common_delete()}
          title={m.common_delete()}
          onclick={() => onchange(entries.filter(e => e !== entry))}
        >
          <Icon icon="lucide:x" class="size-4" />
        </button>
      </li>
    {:else}
      <li class="flex items-center gap-2 px-2 text-base-content/60">
        <Icon icon="lucide:list" class="size-4" />
        {m.tailnet_no_entries()}
      </li>
    {/each}
  </ul>
</div>
