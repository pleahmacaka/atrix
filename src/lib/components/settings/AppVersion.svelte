<script lang="ts">
import { isTauri } from "@tauri-apps/api/core"

const version = isTauri() ? import("@tauri-apps/api/app").then(app => app.getVersion()) : null
</script>

{#if version}
  {#await version then current}
    <span class="text-sm text-base-content/60 tabular-nums">{current}</span>
  {/await}
{/if}
