<script lang="ts">
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { m } from "#lib/paraglide/messages.js"
import { prefs } from "./app/prefs.svelte"
import { defaultShell, loadShells } from "./app/tabs.svelte"
import { kill } from "./pty"
import Terminal from "./Terminal.svelte"

let { cwd = null, shown = true }: { cwd?: string | null; shown?: boolean } =
  $props()

let shell = $state<string>()

let exited = $state(false)

let pty: number | null = null

let gone = false

const bind = (id: number) => {
  if (gone) {
    kill(id)
  } else {
    pty = id
  }
}

const start = () => {
  shell = defaultShell(prefs.shell)
  exited = false
}

const exit = () => {
  pty = null
  exited = true
}

$effect(() => {
  loadShells().then(start)

  return () => {
    gone = true

    if (pty !== null) {
      kill(pty)
    }
  }
})
</script>

<div class="flex min-h-0 flex-1 flex-col p-2">
  {#if exited}
    <EmptyState icon="lucide:square-terminal" text={m.terminal_exited()} centered>
      <button type="button" class="btn btn-sm" onclick={start}>
        {m.terminal_restart()}
      </button>
    </EmptyState>
  {:else if shell}
    <div class="min-h-0 flex-1 overflow-hidden rounded-box border border-base-300">
      <Terminal {shell} {cwd} active={shown} {shown} onpty={bind} onexit={exit} />
    </div>
  {/if}
</div>
