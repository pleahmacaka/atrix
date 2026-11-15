<script lang="ts">
import Icon from "@iconify/svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { settings } from "#lib/store/settings.svelte.ts"

const devices = $derived([
  {
    id: "self",
    name: settings.deviceName,
    host: desktop,
    online: true,
    self: true,
  },
  ...[...sync.peers.values()].map(p => ({ ...p, self: false })),
])
</script>

<div class="flex flex-col gap-1 p-2">
  <ul class="flex flex-col">
    {#each devices as device (device.id)}
      <li class="flex items-center gap-2 rounded-field px-2 py-1.5 text-sm">
        <Icon
          icon={device.self
            ? "lucide:monitor-check"
            : device.host
              ? "lucide:monitor"
              : "lucide:globe"}
          class={[
            "size-4 shrink-0",
            device.self
              ? "text-primary"
              : device.online
                ? "text-success"
                : "opacity-40",
          ]}
        />
        <span
          class="min-w-0 flex-1 truncate"
          title={device.self
            ? m.devices_this()
            : device.host
              ? m.sync_peer_host()
              : m.sync_peer_web()}
        >
          {device.name}
        </span>
      </li>
    {/each}
  </ul>
  {#if sync.peers.size === 0}
    <EmptyState icon="lucide:monitor-smartphone" text={m.sync_no_devices()} />
  {/if}
</div>
