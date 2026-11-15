<script lang="ts">
import Icon from "@iconify/svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import { SETTINGS_TABS } from "./tabs.ts"

let dialog = $state<HTMLDialogElement>()

let tabs = $state<HTMLElement>()

const current = $derived(
  SETTINGS_TABS.find(t => t.id === nav.settingsTab) ?? SETTINGS_TABS[0],
)

$effect(() => {
  if (nav.settings) {
    dialog?.showModal()

    const active = tabs?.querySelector<HTMLElement>("[aria-current=page]")

    active?.focus()
    active?.scrollIntoView({ block: "nearest", inline: "center" })
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
      "modal-box flex h-160 w-11/12 max-w-4xl gap-0 overflow-hidden p-0",
      "max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:flex-col max-sm:rounded-none",
    ]}
  >
    <nav
      bind:this={tabs}
      class={[
        "flex w-52 shrink-0 flex-col gap-1 border-r border-base-300 bg-inset p-2",
        "max-sm:w-full max-sm:flex-row max-sm:overflow-x-auto max-sm:border-r-0",
        "max-sm:scrollbar-none focus:outline-none",
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
            "btn btn-sm shrink-0 justify-start gap-3 border-0 font-normal whitespace-nowrap",
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
    <section class="flex min-h-0 min-w-0 flex-1 flex-col max-sm:contents">
      <header
        class="flex items-center gap-2 px-4 pt-4 pb-2 max-sm:order-first sm:px-6"
      >
        <Icon icon={current.icon} class="size-5 shrink-0 text-primary" />
        <h2 class="min-w-0 flex-1 truncate text-lg font-semibold">
          {current.label}
        </h2>
        <IconButton
          icon="lucide:x"
          label={m.common_close()}
          title={m.common_close_hint()}
          onclick={close}
        />
      </header>
      <div
        class={[
          "flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto",
          "px-4 pb-4 sm:px-6",
        ]}
      >
        {#if nav.settings}
          <current.body />
        {/if}
      </div>
    </section>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button type="submit">{m.common_close()}</button>
  </form>
</dialog>
