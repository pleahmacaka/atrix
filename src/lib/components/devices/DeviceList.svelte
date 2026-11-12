<script lang="ts">
import Icon from "@iconify/svelte"
import { sync } from "#lib/p2p/sync.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { desktop } from "#lib/platform.ts"
import { settings } from "#lib/store/settings.svelte.ts"

const devices = $derived([
  { id: "self", name: settings.deviceName, host: desktop, self: true },
  ...[...sync.peers.values()].map(p => ({ ...p, self: false })),
])
</script>

<div class="flex flex-col gap-1 p-2">
  <p
    class={[
      "flex items-center gap-2 px-2 py-1 text-xs",
      sync.joined ? "text-success" : "text-base-content/50",
    ]}
  >
    <Icon
      icon={sync.joined ? "lucide:radio-tower" : "lucide:wifi-off"}
      class="size-4"
    />
    {sync.joined
      ? m.shell_devices_connected({ count: sync.peers.size })
      : m.shell_sync_off()}
  </p>
  <ul class="flex flex-col">
    {#each devices as device (device.id)}
      <li class="flex items-center gap-2 rounded-field px-2 py-1.5 text-sm">
        <Icon
          icon={device.host ? "lucide:monitor" : "lucide:globe"}
          class="size-4 shrink-0 opacity-60"
        />
        <span class="min-w-0 flex-1 truncate" title={device.name}>
          {device.name}
        </span>
        <span class="badge badge-ghost badge-sm whitespace-nowrap">
          {device.self
            ? m.devices_this()
            : device.host
              ? m.sync_peer_host()
              : m.sync_peer_web()}
        </span>
      </li>
    {/each}
  </ul>
</div>
