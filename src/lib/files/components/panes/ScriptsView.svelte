<script lang="ts">
import Icon from "@iconify/svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { m } from "#lib/paraglide/messages.js"
import { type PackageScripts, packageScripts } from "../../native"
import {
  fallbackManager,
  loadManagers,
  runInTerminal,
  scriptCommand,
} from "../../store/terminal.svelte"

let { dir }: { dir: string } = $props()

let found = $state<PackageScripts | null>(null)

const MANAGER_ICONS: Record<string, string> = {
  bun: "material-icon-theme:bun",
  pnpm: "material-icon-theme:pnpm",
  yarn: "material-icon-theme:yarn",
  npm: "material-icon-theme:npm",
  deno: "material-icon-theme:deno",
}

const manager = $derived(found?.manager ?? fallbackManager())

const runner = $derived(
  (found?.manager ? m.files_scripts_detected : m.files_scripts_fallback)({
    manager,
  }),
)

$effect(() => {
  loadManagers()
})

$effect(() => {
  const target = dir
  let live = true

  packageScripts(target)
    .catch(() => null)
    .then(value => {
      if (live) {
        found = value
      }
    })

  return () => {
    live = false
  }
})
</script>

<div class="flex min-h-0 grow flex-col gap-2">
  <div
    class={[
      "flex shrink-0 items-center gap-2 px-2 pt-1",
      "text-xs text-base-content/60",
    ]}
  >
    <Icon
      icon={MANAGER_ICONS[manager] ?? "material-icon-theme:nodejs"}
      class="size-4 shrink-0"
    />
    <span class="min-w-0 truncate" title={runner}>{runner}</span>
  </div>

  {#if found && found.scripts.length > 0}
    <ul class="flex min-h-0 grow flex-col gap-0.5 overflow-y-auto">
      {#each found.scripts as script (script.name)}
        <li>
          <button
            type="button"
            class={[
              "group flex w-full min-w-0 cursor-pointer items-center gap-2",
              "rounded-field px-2 py-1.5 text-start transition-colors",
              "duration-140 hover:bg-base-content/8",
            ]}
            title={scriptCommand(manager, script.name)}
            onclick={() =>
              runInTerminal(dir, scriptCommand(manager, script.name))}
          >
            <Icon
              icon="lucide:play"
              class={[
                "size-3.5 shrink-0 text-success opacity-60",
                "transition-opacity duration-140 group-hover:opacity-100 pointer-coarse:opacity-100",
              ]}
            />
            <span class="flex min-w-0 grow flex-col">
              <span class="truncate text-sm font-medium">{script.name}</span>
              <span class="truncate text-xs text-base-content/55">
                {script.command}
              </span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if found}
    <EmptyState
      icon="lucide:square-terminal"
      text={m.files_scripts_empty()}
      centered
    />
  {/if}
</div>
