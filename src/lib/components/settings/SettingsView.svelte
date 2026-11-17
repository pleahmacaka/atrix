<script lang="ts">
import { nav } from "#lib/store/nav.svelte.ts"
import { SETTINGS_TABS } from "./tabs.ts"

const current = $derived(SETTINGS_TABS.find(t => t.id === nav.settingsTab) ?? SETTINGS_TABS[0])
</script>

<section
  class="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6"
  aria-label={current.label}
>
  <div class="mx-auto flex w-full max-w-3xl flex-col">
    {#key current.id}
      <current.body />
    {/key}
  </div>
</section>
