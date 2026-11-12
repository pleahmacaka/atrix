<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { Browse } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

let {
  host,
  value = $bindable(),
}: { host: HostView | undefined; value: string } = $props()

const uid = $props.id()

const RECENT_LIMIT = 6

const attempt = new Attempt()

let popover = $state<HTMLElement>()

let current = $state<Browse | null>(null)

const nameOf = (path: string) =>
  path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? path

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
    .filter(Boolean)
    .slice(0, RECENT_LIMIT),
)

const open = (path: string) =>
  attempt.run(async () => {
    if (host) {
      current = await host.browse(path)
    }
  })

const pick = (path: string) => {
  value = path
  popover?.hidePopover()
}
</script>

<div>
  <button
    type="button"
    class="btn btn-ghost btn-sm max-w-56 font-normal"
    title={value}
    popovertarget="{uid}-folder"
    style:anchor-name="--{uid}-folder"
    onclick={() => open(value)}
  >
    <Icon icon="lucide:folder" class="size-4 shrink-0 opacity-60" />
    <span class="min-w-0 truncate">{nameOf(value) || m.chat_folder()}</span>
    <Icon icon="lucide:chevron-down" class="size-3.5 shrink-0 opacity-60" />
  </button>
  <div
    bind:this={popover}
    id="{uid}-folder"
    popover="auto"
    style:position-anchor="--{uid}-folder"
    class={[
      "anchored popover-box fixed inset-auto m-0 my-2 hidden w-96 flex-col",
      "open:flex",
      "gap-2 p-2 text-base-content",
    ]}
  >
    {#if current}
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          aria-label={m.folder_up()}
          title={m.folder_up()}
          disabled={!current.parent}
          onclick={() => current?.parent && open(current.parent)}
        >
          <Icon icon="lucide:arrow-up" class="size-4" />
        </button>
        <span class="min-w-0 flex-1 truncate text-sm font-medium" title={current.path}>
          {current.path}
        </span>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          onclick={() => current && pick(current.path)}
        >
          {m.folder_select()}
        </button>
      </div>
      <ul class="flex max-h-72 flex-col overflow-y-auto">
        {#each current.dirs as dir (dir.path)}
          <li>
            <button
              type="button"
              class={[
                "flex w-full cursor-pointer items-center gap-2 rounded-field px-2 py-1.5",
                "text-start text-sm transition-colors hover:bg-base-200",
              ]}
              onclick={() => open(dir.path)}
            >
              <Icon icon="lucide:folder" class="size-4 shrink-0 text-primary" />
              <span class="min-w-0 flex-1 truncate">{dir.name}</span>
              <Icon icon="lucide:chevron-right" class="size-3.5 shrink-0 opacity-40" />
            </button>
          </li>
        {:else}
          <li class="px-2 py-3 text-sm text-base-content/50">{m.folder_empty()}</li>
        {/each}
      </ul>
    {/if}
    {#if recent.length}
      <p class="px-2 pt-1 text-xs font-semibold text-base-content/55">
        {m.folder_recent()}
      </p>
      <ul class="flex flex-col">
        {#each recent as path (path)}
          <li>
            <button
              type="button"
              class={[
                "flex w-full cursor-pointer items-center gap-2 rounded-field px-2 py-1.5",
                "text-start text-sm transition-colors hover:bg-base-200",
                path === value && "bg-primary/8 text-primary",
              ]}
              title={path}
              onclick={() => pick(path)}
            >
              <Icon icon="lucide:history" class="size-4 shrink-0 opacity-60" />
              <span class="min-w-0 flex-1 truncate">{nameOf(path)}</span>
              <span class="min-w-0 max-w-40 truncate text-xs text-base-content/45">
                {path}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <ErrorAlert message={attempt.failure} />
  </div>
</div>

<style>
  .anchored {
    position-area: block-start span-inline-end;
    position-try-fallbacks: flip-block, flip-inline;
  }
</style>
