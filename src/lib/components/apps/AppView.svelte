<script lang="ts">
import { apps } from "#lib/apps/apps.svelte.ts"
import UiBlocks from "#lib/components/chat/UiBlocks.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import PageHeader from "#lib/components/ui/PageHeader.svelte"
import { m } from "#lib/paraglide/messages.js"

let {
  appKey,
  onclose,
}: { appKey: string; onclose?: () => void } = $props()

const app = $derived(apps.byKey[appKey])
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <PageHeader
    title={app?.title ?? m.apps_missing()}
    icon={app?.icon ?? "lucide:app-window"}
  >
    {#snippet actions()}
      {#if onclose}
        <IconButton icon="lucide:layout-grid" label={m.apps_back()} onclick={onclose} />
      {/if}
    {/snippet}
  </PageHeader>
  <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
    {#if app}
      <UiBlocks blocks={app.blocks} />
    {:else}
      <EmptyState icon="lucide:app-window" text={m.apps_missing()} centered />
    {/if}
  </div>
</div>
