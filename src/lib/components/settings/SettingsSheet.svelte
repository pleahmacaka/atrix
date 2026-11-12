<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import { SETTINGS_TABS } from "./tabs.ts"

let dialog = $state<HTMLDialogElement>()

const current = $derived(
  SETTINGS_TABS.find(t => t.id === nav.settingsTab) ?? SETTINGS_TABS[0],
)

$effect(() => {
  if (nav.settings) {
    dialog?.showModal()
  } else {
    dialog?.close()
  }
})

const close = () => {
  nav.settings = false
}
</script>

<dialog bind:this={dialog} class="modal" onclose={close}>
  <div
    class={[
      "modal-box flex h-160 w-full max-w-4xl gap-0 overflow-hidden p-0",
      "max-sm:h-dvh max-sm:max-h-dvh max-sm:flex-col max-sm:rounded-none",
    ]}
  >
    <nav
      class={[
        "flex w-52 shrink-0 flex-col gap-1 border-r border-base-300 bg-base-200 p-2",
        "max-sm:w-full max-sm:flex-row max-sm:overflow-x-auto max-sm:border-r-0",
        "max-sm:border-b",
      ]}
      aria-label={m.settings_menu()}
    >
      <p class="flex items-center gap-2 px-3 pt-2 pb-3 font-semibold max-sm:hidden">
        <Icon icon="lucide:settings" class="size-4" />
        {m.common_settings()}
      </p>
      {#each SETTINGS_TABS as tab (tab.id)}
        <button
          type="button"
          class={[
            "btn btn-sm justify-start gap-3 border-0 font-normal whitespace-nowrap",
            nav.settingsTab === tab.id
              ? "bg-primary/8 text-primary"
              : "btn-ghost text-base-content/75",
          ]}
          aria-current={nav.settingsTab === tab.id ? "page" : undefined}
          onclick={() => {
            nav.settingsTab = tab.id
          }}
        >
          <Icon icon={tab.icon} class="size-4" />
          {tab.label}
        </button>
      {/each}
    </nav>
    <section class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header class="flex items-center gap-2 px-6 pt-4 pb-2">
        <Icon icon={current.icon} class="size-5 text-primary" />
        <h2 class="flex-1 text-lg font-semibold">{current.label}</h2>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          aria-label={m.common_close()}
          title={m.common_close_hint()}
          onclick={close}
        >
          <Icon icon="lucide:x" class="size-4" />
        </button>
      </header>
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6">
        <current.body />
      </div>
    </section>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button type="submit">{m.common_close()}</button>
  </form>
</dialog>
