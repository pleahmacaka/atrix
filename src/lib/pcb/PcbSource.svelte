<script lang="ts">
import { m } from "#lib/paraglide/messages.js"
import { listFiles, readFile } from "./pcb.ts"

let { root, initial }: { root: string; initial: string | null } = $props()

const SOURCE_DIR = "src"

let files = $state<string[]>([])

let selected = $state<string | null>(null)

let text = $state("")

let failure = $state<string | null>(null)

$effect(() => {
  listFiles(root, SOURCE_DIR)
    .then(found => {
      files = found
      selected = initial && found.includes(initial) ? initial : (found[0] ?? null)
    })
    .catch((e: Error) => (failure = e.message))
})

$effect(() => {
  const path = selected

  if (!path) {
    return
  }

  readFile(root, path)
    .then(bytes => {
      if (selected === path) {
        text = new TextDecoder().decode(bytes)
      }
    })
    .catch((e: Error) => (failure = e.message))
})
</script>

{#if failure}
  <div role="alert" class="alert alert-error alert-soft m-4 text-sm">{failure}</div>
{:else if files.length === 0}
  <p class="p-4 text-sm opacity-60">{m.pcb_no_source()}</p>
{:else}
  <div class="flex size-full min-h-0">
    <ul class="menu menu-sm w-56 shrink-0 flex-nowrap overflow-y-auto border-r border-base-300">
      {#each files as file (file)}
        <li>
          <button
            type="button"
            class={["truncate", selected === file && "menu-active"]}
            title={file}
            onclick={() => (selected = file)}
          >
            {file.slice(SOURCE_DIR.length + 1)}
          </button>
        </li>
      {/each}
    </ul>
    <pre class="min-w-0 flex-1 overflow-auto p-4 text-xs leading-relaxed whitespace-pre tabular-nums">{text}</pre>
  </div>
{/if}
