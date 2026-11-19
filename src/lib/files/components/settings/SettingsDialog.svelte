<script lang="ts">
  import Icon from "@iconify/svelte"
  import { getVersion } from "@tauri-apps/api/app"
  import { MediaQuery } from "svelte/reactivity"
  import ConfirmDialog from "#lib/components/ui/ConfirmDialog.svelte"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import Modal from "#lib/components/ui/Modal.svelte"
  import Section from "#lib/components/ui/Section.svelte"
  import SettingRow from "#lib/components/ui/SettingRow.svelte"
  import { toast } from "#lib/files/store/toast.svelte.ts"
  import { m } from "#lib/paraglide/messages.js"
  import { parentOf } from "../../locations"
  import { logFile } from "../../native"
  import { archives } from "../../store/archive.svelte"
  import type { Explorer } from "../../store/explorer.svelte"
  import { prefs, resetPrefs } from "../../store/prefs.svelte"
  import TranscribeSettings from "../audio/TranscribeSettings.svelte"
  import DeviceSettings from "../share/DeviceSettings.svelte"
  import TerminalSettings from "../terminal/TerminalSettings.svelte"
  import DecorSettings from "./DecorSettings.svelte"
  import DefaultAppRows from "./DefaultAppRows.svelte"
  import MenuSettings from "./MenuSettings.svelte"
  import SidebarSettings from "./SidebarSettings.svelte"

  type Page =
    | "general"
    | "decor"
    | "sidebar"
    | "contextMenu"
    | "defaultApp"
    | "terminal"
    | "transcribe"
    | "devices"
    | "about"

  type Toggle =
    | "showHidden"
    | "showExtensions"
    | "preview"
    | "selectionInMore"
    | "compactToolbar"

  let {
    open = $bindable(false),
    standalone = false,
    explorer,
  }: { open?: boolean; standalone?: boolean; explorer: Explorer } = $props()

  const PAGES: { id: Page; icon: string; label: () => string }[] = [
    {
      id: "general",
      icon: "lucide:settings-2",
      label: m.files_settings_pages_general,
    },
    {
      id: "decor",
      icon: "lucide:highlighter",
      label: m.files_settings_pages_decor,
    },
    {
      id: "sidebar",
      icon: "lucide:panel-left",
      label: m.files_settings_pages_sidebar,
    },
    {
      id: "contextMenu",
      icon: "lucide:square-menu",
      label: m.files_settings_pages_context_menu,
    },
    {
      id: "defaultApp",
      icon: "lucide:folder-check",
      label: m.files_settings_pages_default_app,
    },
    {
      id: "terminal",
      icon: "lucide:square-terminal",
      label: m.files_settings_pages_terminal,
    },
    {
      id: "transcribe",
      icon: "lucide:audio-lines",
      label: m.files_settings_pages_transcribe,
    },
    {
      id: "devices",
      icon: "lucide:share-2",
      label: m.files_settings_pages_devices,
    },
    { id: "about", icon: "lucide:info", label: m.files_settings_pages_about },
  ]

  const narrow = new MediaQuery("(width < 40rem)")

  const version = getVersion()

  let page = $state<Page>("general")
  let resetting = $state(false)

  const current = $derived(PAGES.find(entry => entry.id === page) ?? PAGES[0])

  const showLog = async () => {
    const file = await logFile().catch(() => null)
    const folder = file && parentOf(file)

    if (!file || !folder) {
      toast(m.files_settings_no_log(), "info")

      return
    }

    open = false
    explorer.go(folder, file)
  }

  const rerunSetup = () => {
    open = false
    explorer.setupOpen = true
  }
</script>

{#snippet toggleRow(key: Toggle, title: string)}
  <SettingRow {title}>
    <input
      type="checkbox"
      class="toggle toggle-sm toggle-primary"
      aria-label={title}
      bind:checked={prefs[key]}
    />
  </SettingRow>
{/snippet}

{#snippet pageList(row: boolean)}
  <nav
    class={["flex gap-0.5 px-2 pb-2", row ? "flex-row" : "flex-col"]}
    aria-label={m.settings_menu()}
  >
    {#each PAGES as entry (entry.id)}
      {@const selected = page === entry.id}

      <button
        type="button"
        class={[
          "flex h-8 min-w-0 cursor-pointer items-center gap-2 rounded-field text-sm",
          row ? "shrink-0 px-3" : "px-2",
          "transition-colors duration-140",
          selected
            ? "bg-primary/8 text-primary"
            : "text-base-content/75 hover:bg-base-content/8",
        ]}
        aria-current={selected ? "page" : undefined}
        title={entry.label()}
        onclick={() => (page = entry.id)}
      >
        <Icon icon={entry.icon} class="size-4 shrink-0" />
        <span
          class={[
            "min-w-0 text-start",
            row ? "whitespace-nowrap" : "flex-1 truncate",
          ]}
        >
          {entry.label()}
        </span>
      </button>
    {/each}
  </nav>
{/snippet}

<Modal
  bind:open
  label={m.files_settings_title()}
  class={[
    "w-full overflow-hidden",
    narrow.current
      ? "h-dvh max-h-none flex-col rounded-none"
      : "h-160 max-w-3xl flex-row",
  ]}
>
  {#if narrow.current}
    <div class="flex shrink-0 items-start bg-base-200/60 pt-2">
      <div class="min-w-0 flex-1 overflow-x-auto scrollbar-none">
        {@render pageList(true)}
      </div>

      <IconButton
        icon="lucide:x"
        label={m.common_close()}
        class="me-1 shrink-0"
        onclick={() => (open = false)}
      />
    </div>
  {:else}
    <div class="flex w-44 shrink-0 flex-col bg-base-200/60 pt-3">
      {@render pageList(false)}
    </div>
  {/if}

  <section
    class="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto p-4 sm:p-5"
    aria-label={current.label()}
  >
    {#if page === "general"}
      <Section title={m.files_settings_display()}>
        {@render toggleRow("showHidden", m.files_settings_show_hidden())}
        {@render toggleRow("showExtensions", m.files_settings_show_extensions())}
        {@render toggleRow("preview", m.files_settings_preview_pane())}
      </Section>

      <Section title={m.files_settings_toolbar()}>
        {@render toggleRow("compactToolbar", m.files_settings_compact_toolbar())}
        {@render toggleRow(
          "selectionInMore",
          m.files_settings_selection_in_more(),
        )}
      </Section>
    {:else if page === "decor"}
      <DecorSettings />
    {:else if page === "sidebar"}
      <SidebarSettings />
    {:else if page === "contextMenu"}
      <MenuSettings />
    {:else if page === "defaultApp"}
      <Section>
        <DefaultAppRows />
      </Section>
    {:else if page === "terminal"}
      <TerminalSettings />
    {:else if page === "transcribe"}
      <TranscribeSettings />
    {:else if page === "devices"}
      <DeviceSettings />
    {:else}
      <Section>
        <SettingRow title={m.files_settings_version()}>
          {#await version then value}
            <span class="text-sm text-base-content/60 tabular-nums">{value}</span>
          {/await}
        </SettingRow>

        <SettingRow title={m.files_settings_archive_backend()}>
          <span class="text-sm text-base-content/60">
            {archives.bandizip
              ? m.files_settings_archive_bandizip()
              : m.files_settings_archive_builtin()}
          </span>
        </SettingRow>

        <SettingRow title={m.files_settings_log()}>
          <button type="button" class="btn btn-sm" onclick={showLog}>
            {m.files_settings_show_log()}
          </button>
        </SettingRow>

        {#if standalone}
          <SettingRow title={m.files_settings_rerun_setup()}>
            <button type="button" class="btn btn-sm" onclick={rerunSetup}>
              {m.files_settings_run()}
            </button>
          </SettingRow>
        {/if}

        <SettingRow title={m.files_settings_reset()}>
          <button
            type="button"
            class="btn btn-sm btn-ghost text-error"
            onclick={() => (resetting = true)}
          >
            {m.files_settings_reset_action()}
          </button>
        </SettingRow>
      </Section>
    {/if}
  </section>
</Modal>

<ConfirmDialog
  bind:open={resetting}
  title={m.files_settings_reset_title()}
  body={m.files_settings_reset_body()}
  action={m.files_settings_reset_action()}
  onconfirm={resetPrefs}
/>
