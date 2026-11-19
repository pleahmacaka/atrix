<script lang="ts">
import { updateDevice, type WebSearchEngine } from "@atrix/settings"
import type { Attachment } from "svelte/attachments"
import SearchField from "#lib/components/ui/SearchField.svelte"
import Select from "#lib/components/ui/Select.svelte"
import Stepper from "#lib/components/ui/Stepper.svelte"
import { EditSpot } from "#lib/desktop/edit/index.js"
import { m } from "#lib/paraglide/messages.js"
import type { Launcher } from "./launcher.svelte"
import { engineName } from "./providers"
import { timerKindLabel } from "./timers"

let { launcher }: { launcher: Launcher } = $props()

type LauncherBool = "showWindows" | "showCommands" | "showTodos" | "calculator"

const RESULTS = { min: 3, max: 12, step: 1, base: 6 }

const ENGINES: WebSearchEngine[] = ["google", "duckduckgo", "bing", "naver"]

const engineOptions = ENGINES.map(value => ({ value, label: engineName(value) }))

const MODE_LABELS = {
  run: m.launcher_mode_run,
  todo: m.launcher_mode_todo,
  calc: m.launcher_mode_calc,
  clip: m.launcher_mode_clip,
  emoji: m.launcher_mode_emoji,
}

const route = $derived(launcher.route)

const modeLabel = $derived(
  route.mode === "timer"
    ? timerKindLabel(route.kind)
    : route.mode === "search"
      ? ""
      : MODE_LABELS[route.mode](),
)

const field: Attachment<HTMLElement> = node => {
  launcher.input = node.querySelector("input") ?? undefined

  return () => {
    launcher.input = undefined
  }
}
</script>

{#snippet toggle(key: LauncherBool, label: string)}
  <label class="flex min-h-8 cursor-pointer items-center justify-between gap-3 text-sm">
    <span class="min-w-0 truncate">{label}</span>
    <input
      type="checkbox"
      class="toggle toggle-primary toggle-sm"
      checked={launcher.profile.launcher[key]}
      onchange={e => launcher.patchLauncher(key, e.currentTarget.checked)}
    />
  </label>
{/snippet}

{#snippet searchOptions()}
  <div class="flex min-h-8 items-center justify-between gap-3 text-sm">
    <span class="min-w-0 truncate">{m.launcher_opt_results()}</span>
    <Stepper
      label={m.launcher_opt_results()}
      value={launcher.profile.launcher.maxResults}
      range={RESULTS}
      onchange={value => launcher.patchLauncher("maxResults", value)}
    />
  </div>
  {@render toggle("showWindows", m.launcher_opt_windows())}
  {@render toggle("showCommands", m.launcher_opt_commands())}
  {@render toggle("showTodos", m.launcher_opt_todos())}
  {@render toggle("calculator", m.launcher_opt_calculator())}
  <div class="flex min-h-8 items-center justify-between gap-3 text-sm">
    <span class="min-w-0 truncate">{m.launcher_opt_web()}</span>
    <Select
      class="w-36"
      label={m.launcher_opt_web()}
      options={engineOptions}
      value={launcher.profile.launcher.webSearch}
      onchange={value => launcher.patchLauncher("webSearch", value)}
    />
  </div>
  <label class="flex min-h-8 cursor-pointer items-center justify-between gap-3 text-sm">
    <span class="min-w-0 truncate">{m.launcher_opt_keymap()}</span>
    <input
      type="checkbox"
      class="toggle toggle-primary toggle-sm"
      checked={launcher.device.showKeymap}
      onchange={e => updateDevice(d => ({ ...d, showKeymap: e.currentTarget.checked }))}
    />
  </label>
{/snippet}

<EditSpot
  id="search"
  label={m.launcher_spot_search()}
  placement="down"
  align="start"
  class="shrink-0"
  options={searchOptions}
>
  <div class="flex min-w-0 flex-1 items-center gap-1" {@attach field}>
    <SearchField
      bind:value={launcher.query}
      label={m.launcher_placeholder()}
      class="h-10 flex-1"
      autocapitalize="off"
      oninput={() => launcher.reset()}
    />
    {#if modeLabel}
      <span class="badge badge-soft badge-primary badge-sm shrink-0 whitespace-nowrap">
        {modeLabel}
      </span>
    {/if}
  </div>
</EditSpot>
