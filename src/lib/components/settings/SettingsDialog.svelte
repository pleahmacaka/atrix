<script lang="ts">
import { MediaQuery } from "svelte/reactivity"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Modal from "#lib/components/ui/Modal.svelte"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import { SETTINGS_PAGE } from "#lib/store/pages.ts"
import { desktopSettings } from "./desktop.svelte.ts"
import SettingsList from "./SettingsList.svelte"
import { SETTINGS_TABS } from "./tabs.ts"

const narrow = new MediaQuery("(width < 40rem)")

const current = $derived(SETTINGS_TABS.find(t => t.id === nav.settingsTab) ?? SETTINGS_TABS[0])

$effect(() => desktopSettings.start())
</script>

<Modal
  bind:open={nav.settingsOpen}
  label={SETTINGS_PAGE.label()}
  class={[
    "w-full overflow-hidden",
    narrow.current ? "h-dvh max-h-none flex-col rounded-none" : "h-160 max-w-3xl flex-row",
  ]}
>
  {#if narrow.current}
    <div class="flex shrink-0 items-start bg-base-200/60 pt-2">
      <div class="min-w-0 flex-1 overflow-x-auto scrollbar-none">
        <SettingsList row />
      </div>
      <IconButton
        icon="lucide:x"
        label={m.common_close()}
        class="me-1 shrink-0"
        onclick={() => (nav.settingsOpen = false)}
      />
    </div>
  {:else}
    <div class="flex w-44 shrink-0 flex-col bg-base-200/60 pt-3">
      <SettingsList />
    </div>
  {/if}
  <section
    class="@container flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto p-4 sm:p-5"
    aria-label={current.label}
  >
    {#key current.id}
      <current.body />
    {/key}
  </section>
</Modal>