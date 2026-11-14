<script lang="ts">
import Icon from "@iconify/svelte"
import { brandIcon } from "#lib/components/harness/brands.ts"
import HarnessStack from "#lib/components/harness/HarnessStack.svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { type HostEntry, hostList } from "#lib/p2p/hosts.svelte.ts"
import type { HarnessInfo } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

const attempt = new Attempt()

const hosts = $derived(hostList())

let busy = $state<string | null>(null)

const toggle = (host: HostEntry, harness: HarnessInfo) =>
  attempt.run(async () => {
    busy = harness.id

    try {
      await host.view.toggle(harness.id, !harness.enabled)
    } finally {
      busy = null
    }
  })
</script>

{#each hosts as host (host.id)}
  {@const harnesses = host.view.state?.harnesses ?? []}
  <section class="border-b border-base-300 py-4 last:border-b-0">
    <div class="mb-4 flex items-center gap-3">
      <span class="grid size-8 shrink-0 place-items-center rounded-field bg-base-200">
        <Icon icon="lucide:monitor" class="size-4 text-base-content/70" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">{host.name}</p>
        <p class="text-xs text-base-content/60">
          {m.harness_enabled_count({
            enabled: harnesses.filter(h => h.enabled).length,
            total: harnesses.length,
          })}
        </p>
      </div>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        disabled={attempt.busy}
        onclick={() => attempt.run(host.view.detect)}
        aria-label={m.harness_detect()}
        title={m.harness_detect()}
      >
        <Icon icon="lucide:refresh-cw" class="size-4" />
      </button>
    </div>
    <div class="mb-4 ps-11">
      <HarnessStack {harnesses} {busy} onToggle={h => toggle(host, h)} />
    </div>
    <ul class="flex flex-col ps-11">
      {#each harnesses as h (h.id)}
        <li class="flex items-center gap-3 py-1.5">
          <Icon
            icon={brandIcon(h.base)}
            class={["size-4 shrink-0", !h.enabled && "opacity-30"]}
          />
          <span
            class={["min-w-0 flex-1 truncate text-sm", !h.enabled && "opacity-50"]}
          >
            {h.name}
          </span>
          <input
            type="checkbox"
            class="toggle toggle-sm toggle-primary"
            aria-label={m.harness_use({ name: h.name })}
            checked={h.enabled}
            disabled={busy === h.id}
            onchange={() => toggle(host, h)}
          />
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <p class="flex items-center gap-2 py-4 text-sm text-base-content/60">
    <Icon icon="lucide:monitor-off" class="size-4" />
    {m.harness_no_hosts()}
  </p>
{/each}
<ErrorAlert message={attempt.failure} />
