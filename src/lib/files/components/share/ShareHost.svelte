<script lang="ts">
  import { m } from "#lib/paraglide/messages.js"
  import type { Explorer } from "../../store/explorer.svelte"
  import BrowseAsks from "./BrowseAsks.svelte"
  import { share, startShare } from "./share.svelte"

  let { explorer }: { explorer: Explorer } = $props()

  $effect(() => startShare())
</script>

{#if share.state.browseAsks.length > 0 && !explorer.settingsOpen}
  <section
    class="island fixed right-4 bottom-12 z-50 flex w-80 flex-col px-4 pt-3"
    aria-label={m.files_devices_requests()}
  >
    <h2 class="text-sm font-medium text-base-content/70">
      {m.files_devices_requests()}
    </h2>
    <BrowseAsks />
  </section>
{/if}
