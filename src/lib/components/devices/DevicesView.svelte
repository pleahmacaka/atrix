<script lang="ts">
import DeviceTab from "#lib/components/settings/DeviceTab.svelte"
import SyncTab from "#lib/components/settings/SyncTab.svelte"
</script>

<div class="min-h-0 flex-1 overflow-y-auto">
  <div class="mx-auto flex w-full max-w-2xl flex-col px-6 py-6">
    <DeviceTab />
    <SyncTab />
  </div>
</div>
