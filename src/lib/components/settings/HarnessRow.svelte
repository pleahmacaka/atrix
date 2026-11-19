<script lang="ts">
import Icon from "@iconify/svelte"
import { brandIcon } from "#lib/components/harness/brands.ts"
import type { HostEntry } from "#lib/p2p/hosts.svelte.ts"
import type { HarnessInfo } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import HostTag from "./HostTag.svelte"

let {
  host,
  harness,
  many,
  disabled,
  onopen,
  ontoggle,
}: {
  host: HostEntry
  harness: HarnessInfo
  many: boolean
  disabled: boolean
  onopen: () => void
  ontoggle: () => void
} = $props()
</script>

<div class="flex min-w-0 items-center gap-2">
  <button
    type="button"
    class={[
      "flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-field px-2 text-start",
      "transition-colors duration-140 hover:bg-base-content/5",
    ]}
    onclick={onopen}
  >
    <Icon icon={brandIcon(harness.base)} class="size-5 shrink-0" />
    <span class="min-w-0 truncate text-sm font-medium">{harness.name}</span>
    <HostTag {host} {many} />
    <span class="flex-1"></span>
    {#if harness.providerModel}
      <span class="max-w-40 min-w-0 truncate text-xs text-base-content/45" title={harness.providerModel}>
        {harness.providerModel}
      </span>
    {/if}
    <Icon icon="lucide:chevron-right" class="size-4 shrink-0 text-base-content/40" />
  </button>
  <input
    type="checkbox"
    class="toggle toggle-sm toggle-primary shrink-0"
    aria-label={m.harness_use({ name: harness.name })}
    checked={harness.enabled}
    {disabled}
    onchange={ontoggle}
  />
</div>