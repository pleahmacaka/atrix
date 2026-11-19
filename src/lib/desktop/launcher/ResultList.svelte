<script lang="ts">
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import MenuLabel from "#lib/components/ui/MenuLabel.svelte"
import { appIcon } from "#lib/desktop/apps.js"
import { m } from "#lib/paraglide/messages.js"
import type { Launcher } from "./launcher.svelte"
import ResultRow from "./ResultRow.svelte"

let { launcher }: { launcher: Launcher } = $props()

const GUIDE = "lucide:text-cursor-input"

const empty = $derived.by(() => {
  const route = launcher.route

  if (route.mode === "timer") {
    return {
      icon: GUIDE,
      text: route.kind === "alarm" ? m.launcher_empty_alarm() : m.launcher_empty_timer(),
    }
  }

  if (route.mode === "run") {
    return { icon: GUIDE, text: m.launcher_empty_run() }
  }

  if (route.mode === "todo") {
    return { icon: GUIDE, text: m.launcher_empty_todo() }
  }

  if (route.mode === "calc") {
    return { icon: GUIDE, text: m.launcher_empty_calc() }
  }

  if (route.mode === "clip" && !route.text) {
    return { icon: "lucide:clipboard", text: m.launcher_empty_clip() }
  }

  if (route.text || route.mode !== "search") {
    return { icon: "lucide:search-x", text: m.common_no_results() }
  }

  return {
    icon: "lucide:search",
    text: launcher.apps.length ? m.launcher_placeholder() : m.launcher_empty_loading(),
  }
})

$effect(() => {
  for (const item of launcher.flat) {
    const path = item.iconPath

    if (!path || item.icon.startsWith("data:")) {
      continue
    }

    appIcon(path).then(icon => {
      if (icon) {
        launcher.icons[path] = icon
      }
    })
  }
})

$effect(() => {
  launcher.list
    ?.querySelector(`[data-index="${launcher.active}"]`)
    ?.scrollIntoView({ block: "nearest" })
})
</script>

<div
  bind:this={launcher.list}
  role="listbox"
  aria-label={m.launcher_results()}
  tabindex="-1"
  class="min-h-0 flex-1 overflow-y-auto"
>
  {#each launcher.groups as group (group.label)}
    <MenuLabel text={group.label} />
    {#each group.items as item, j (item.id)}
      <ResultRow {launcher} {item} index={group.start + j} />
    {/each}
  {:else}
    <EmptyState icon={empty.icon} text={empty.text} centered />
  {/each}
  <ErrorAlert message={launcher.error} />
</div>
