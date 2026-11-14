<script lang="ts">
import { m } from "#lib/paraglide/messages.js"
  import "../app.css";
  import "virtual:iconify-embed";
  import { onMount, type Snippet } from "svelte";
  import { startLogging } from "#lib/logging.ts";
  import { startLocalHost } from "#lib/p2p/hosts.svelte.ts";
  import { sync } from "#lib/p2p/sync.svelte.ts";
  import { startAppearance } from "#lib/store/appearance.svelte.ts"
  import { connectOpenRouter } from "#lib/store/gateways.svelte.ts";
  import { local } from "#lib/store/local.svelte.ts";
import { currentLocale } from "#lib/store/locale.ts";
  import { captureCallback, finishCallback } from "#lib/store/openrouter.ts";

  let { children }: { children: Snippet } = $props();
  let failure = $state<string | null>(null);

  const report = (e: unknown) => {
  failure = e instanceof Error ? e.message : String(e)
}

startLogging()
startAppearance()

document.documentElement.lang = currentLocale()

  onMount(async () => {
  captureCallback()
  startLocalHost().catch(report)

    try {
    await local.load()

    const key = await finishCallback()

      if (key) {
      await connectOpenRouter(key)
      }

      if (local.data.sync) {
      await sync.join(local.data.sync)
      }
  } catch (e) {
    report(e)
    }
})
</script>

{#if local.ready}
  {@render children()}
{:else}
  <main class="grid h-dvh place-items-center">
    <span class="loading loading-spinner opacity-60"></span>
  </main>
{/if}

{#if failure}
  <div class="toast toast-end">
    <div role="alert" class="alert alert-error text-sm">
      <span>{failure}</span>
      <button
        type="button"
        class="btn btn-ghost btn-xs"
        onclick={() => {
          failure = null
        }}
      >
        {m.common_close()}
      </button>
    </div>
  </div>
{/if}

