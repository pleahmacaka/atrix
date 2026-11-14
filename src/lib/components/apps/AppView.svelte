<script lang="ts">
import Icon from "@iconify/svelte"
import { apps } from "#lib/apps/apps.svelte.ts"
import UiBlocks from "#lib/components/chat/UiBlocks.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { m } from "#lib/paraglide/messages.js"

let {
  appKey,
  onclose,
}: { appKey: string; onclose?: () => void } = $props()

const app = $derived(apps.byKey[appKey])
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <header class="flex h-11 shrink-0 items-center gap-2 px-3">
    {#if onclose}
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label={m.apps_back()}
        title={m.apps_back()}
        onclick={onclose}
      >
        <Icon icon="lucide:arrow-left" class="size-4" />
      </button>
    {/if}
    <Icon icon={app?.icon ?? "lucide:app-window"} class="size-4 text-primary" />
    <span class="min-w-0 flex-1 truncate text-sm font-medium">
      {app?.title ?? m.apps_missing()}
    </span>
  </header>
  <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
    {#if app}
      <UiBlocks blocks={app.blocks} />
    {:else}
      <EmptyState icon="lucide:app-window" text={m.apps_missing()} />
    {/if}
  </div>
</div>
