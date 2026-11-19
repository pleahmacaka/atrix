<script lang="ts">
import Icon from "@iconify/svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import type { Stroke, TerminalDialog } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { CARD } from "./labels.ts"

let {
  dialog,
  onPress,
}: {
  dialog: TerminalDialog
  onPress: (strokes: Stroke[]) => Promise<boolean>
} = $props()

let text = $state("")

const send = async () => {
  const typed = text.trim()

  if (typed) {
    text = ""

    if (!(await onPress([{ kind: "text", text: typed }, { kind: "enter" }]))) {
      text = typed
    }
  }
}
</script>

<section class={CARD} aria-label={m.terminal_dialog()}>
  <header class="mb-2 flex items-center gap-2 text-sm font-semibold">
    <Icon icon="lucide:square-terminal" class="size-4 shrink-0 text-primary" />
    <span class="min-w-0 flex-1 truncate">{m.terminal_dialog()}</span>
  </header>
  {#if dialog.lines.length}
    <div class="mb-3 flex flex-col gap-0.5 text-sm break-words whitespace-pre-wrap text-base-content/80">
      {#each dialog.lines as line, i (i)}
        <p>{line}</p>
      {/each}
    </div>
  {/if}
  {#if dialog.options.length}
    <div class="flex flex-col gap-1">
      {#each dialog.options as option, i (i)}
        <button
          type="button"
          class={[
            "flex min-w-0 cursor-pointer items-start gap-2 rounded-field px-3 py-2 text-start",
            "transition-colors duration-140",
            option.current ? "bg-primary/8 text-primary" : "hover:bg-base-content/5",
          ]}
          onclick={() => onPress([{ kind: "digit", digit: option.digit }])}
        >
          <span class="w-4 shrink-0 text-sm tabular-nums opacity-60">{option.digit}</span>
          <span class="flex min-w-0 flex-col">
            <span class="text-sm font-medium break-words">{option.label}</span>
            {#if option.detail}
              <span class="text-xs break-words text-base-content/60">{option.detail}</span>
            {/if}
          </span>
        </button>
      {/each}
    </div>
  {/if}
  <form
    class="mt-3 flex items-center gap-2"
    onsubmit={e => {
      e.preventDefault()
      send()
    }}
  >
    <input
      class="input input-sm min-w-0 flex-1"
      placeholder={m.terminal_type()}
      aria-label={m.terminal_type()}
      bind:value={text}
    />
    <IconButton type="submit" icon="lucide:corner-down-left" label={m.terminal_send()} disabled={!text.trim()} />
  </form>
  <div class="mt-2 flex items-center justify-end gap-1">
    <IconButton icon="lucide:arrow-right-to-line" label={m.terminal_tab()} size="xs" onclick={() => onPress([{ kind: "tab" }])} />
    <IconButton icon="lucide:arrow-left" label={m.terminal_left()} size="xs" onclick={() => onPress([{ kind: "left" }])} />
    <IconButton icon="lucide:arrow-right" label={m.terminal_right()} size="xs" onclick={() => onPress([{ kind: "right" }])} />
    <IconButton icon="lucide:arrow-up" label={m.terminal_up()} size="xs" onclick={() => onPress([{ kind: "up" }])} />
    <IconButton icon="lucide:arrow-down" label={m.terminal_down()} size="xs" onclick={() => onPress([{ kind: "down" }])} />
    <button type="button" class="btn btn-ghost btn-xs" onclick={() => onPress([{ kind: "escape" }])}>
      {m.terminal_close()}
    </button>
    <button type="button" class="btn btn-primary btn-xs" onclick={() => onPress([{ kind: "enter" }])}>
      {m.terminal_select()}
    </button>
  </div>
</section>
