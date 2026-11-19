<script lang="ts">
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import { m } from "#lib/paraglide/messages.js"
import { hostOf } from "../../hosts"
import { type FolderPane, prefs } from "../../store/prefs.svelte"
import type { Tab } from "../../store/tab.svelte"
import GitPanel from "./GitPanel.svelte"
import ReadmeView from "./ReadmeView.svelte"
import ScriptsView from "./ScriptsView.svelte"

let { tab }: { tab: Tab } = $props()

const README_NAMES = [
  "readme.md",
  "readme.markdown",
  "readme",
  "readme.txt",
  "readme.rst",
]

const repo = $derived(tab.insight.view.repo)

const host = $derived(hostOf(repo?.head, prefs.gitHosts))

const readme = $derived(
  tab.kind === "folder"
    ? README_NAMES.map(name =>
        tab.items.find(item => !item.dir && item.name.toLowerCase() === name),
      ).find(Boolean)
    : undefined,
)

const manifest = $derived(
  tab.kind === "folder"
    ? tab.items.find(
        item => !item.dir && item.name.toLowerCase() === "package.json",
      )
    : undefined,
)

const modes = $derived(
  [
    {
      id: "readme" as FolderPane,
      label: m.files_folder_pane_readme(),
      icon: "lucide:book-open",
      shown: !!readme,
    },
    {
      id: "git" as FolderPane,
      label: host.name ?? m.files_folder_pane_git(),
      icon: host.icon,
      shown: !!repo,
    },
    {
      id: "scripts" as FolderPane,
      label: m.files_folder_pane_scripts(),
      icon: "material-icon-theme:nodejs",
      shown: !!manifest,
    },
  ].filter(mode => mode.shown),
)

const mode = $derived(
  modes.find(entry => entry.id === prefs.folderPane)?.id ??
    modes[0]?.id ??
    null,
)
</script>

{#if mode}
  <div class="flex shrink-0 items-center gap-2">
    <Segmented
      label={m.files_settings_preview_pane()}
      items={modes}
      value={mode}
      onpick={id => (prefs.folderPane = id)}
    />
    {#if mode === "readme"}
      <IconButton
        icon="lucide:code"
        label={m.files_folder_pane_raw()}
        aria-pressed={prefs.readmeRaw}
        class={[
          "ms-auto shrink-0",
          prefs.readmeRaw && "bg-primary/8 text-primary",
        ]}
        onclick={() => (prefs.readmeRaw = !prefs.readmeRaw)}
      />
    {/if}
  </div>

  <div class="flex min-h-0 grow flex-col overflow-hidden">
    {#if mode === "git" && repo}
      <GitPanel insight={tab.insight} />
    {:else if mode === "scripts" && manifest}
      {#key manifest.modified}
        <ScriptsView dir={tab.location} />
      {/key}
    {:else if readme}
      <ReadmeView path={readme.path} name={readme.name} raw={prefs.readmeRaw} />
    {/if}
  </div>
{:else}
  <EmptyState
    icon="lucide:mouse-pointer-click"
    text={m.files_states_select_to_preview()}
    centered
  />
{/if}
