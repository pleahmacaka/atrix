<script lang="ts">
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"

let { file, text, onclose }: { file: string; text: string; onclose: () => void } =
  $props()

const tone = (line: string) => {
  if (line.startsWith("+++") || line.startsWith("---")) {
    return "text-base-content/50"
  }

  if (line.startsWith("+")) {
    return "bg-success/8 text-success"
  }

  if (line.startsWith("-")) {
    return "bg-error/8 text-error"
  }

  if (line.startsWith("@@")) {
    return "text-info"
  }

  return ""
}

const lines = $derived(text.split("\n"))
</script>

<dialog
  class="modal"
  aria-label={m.git_diff()}
  {@attach d => d.showModal()}
  {onclose}
>
  <section
    class={[
      "modal-box flex max-h-5/6 w-11/12 max-w-5xl flex-col gap-3 p-4",
      "rounded-box border border-base-300",
    ]}
  >
    <header class="flex items-center gap-2">
      <h2 class="min-w-0 flex-1 truncate text-sm font-semibold" title={file}>{file}</h2>
      <form method="dialog">
        <IconButton icon="lucide:x" label={m.common_close()} size="xs" type="submit" />
      </form>
    </header>
    <div class="min-h-0 flex-1 overflow-auto rounded-field bg-base-200 py-2 text-xs">
      {#if text.trim()}
        {#each lines as line, i (i)}
          <div class={["px-3 whitespace-pre tabular-nums", tone(line)]}>{line || " "}</div>
        {/each}
      {:else}
        <p class="px-3 text-base-content/60">{m.git_diff_empty()}</p>
      {/if}
    </div>
  </section>
  <form method="dialog" class="modal-backdrop">
    <button type="submit" class="cursor-default" aria-label={m.common_close()}></button>
  </form>
</dialog>
