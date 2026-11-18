<script lang="ts">
import { MediaQuery } from "svelte/reactivity"
import Modal from "#lib/components/ui/Modal.svelte"
import { nav } from "#lib/store/nav.svelte.ts"
import { SETTINGS_PAGE } from "#lib/store/pages.ts"
import SettingsList from "./SettingsList.svelte"
import { SETTINGS_TABS } from "./tabs.ts"

const narrow = new MediaQuery("(width < 40rem)")

const current = $derived(SETTINGS_TABS.find(t => t.id === nav.settingsTab) ?? SETTINGS_TABS[0])
</script>

<Modal
  bind:open={nav.settingsOpen}
  label={SETTINGS_PAGE.label()}
  class="h-160 w-full max-w-3xl flex-row overflow-hidden"
>
  <div class="flex shrink-0 flex-col bg-base-200/60 pt-3 sm:w-44">
    <SettingsList rail={narrow.current} />
  </div>
  <section
    class="@container flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto p-4 sm:p-5"
    aria-label={current.label}
  >
    {#key current.id}
      <current.body />
    {/key}
  </section>
</Modal>
