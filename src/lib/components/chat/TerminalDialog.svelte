<script lang="ts">
import Icon from "@iconify/svelte"
import { isCheckbox } from "#lib/acp/claudeScreen.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import type { Stroke, TerminalDialog } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { CARD } from "./labels.ts"
import Markdown from "./Markdown.svelte"

let {
  dialog,
  onPress,
}: {
  dialog: TerminalDialog
  onPress: (strokes: Stroke[]) => Promise<boolean>
} = $props()

const ADVANCE = ["Next", "Submit"]

let text = $state("")

const checks = $derived(dialog.options.some(o => isCheckbox(o.label)))

const typing = $derived(
  dialog.options.findIndex(o => ADVANCE.includes(o.detail.trim())),
)

const cursor = $derived.by(() => {
  const at = dialog.options.findIndex(o => o.current)

  return at === -1 ? typing + 1 : at
})

const step = (count: number): Stroke[] =>
  Array.from({ length: Math.abs(count) }, () => ({
    kind: count > 0 ? "down" : "up",
  }))

const guided = $derived(checks && typing !== -1)

const advance = (): Stroke[] =>
  guided
    ? [...step(typing + 1 - cursor), { kind: "enter" }]
    : [{ kind: "enter" }]

const send = async () => {
  const typed = text.trim()

  if (!typed) {
    return
  }

  text = ""

  const strokes: Stroke[] = guided
    ? [
        ...step(typing - cursor),
        { kind: "text", text: typed },
        { kind: "down" },
        { kind: "enter" },
      ]
    : [{ kind: "text", text: typed }, { kind: "enter" }]

  if (!(await onPress(strokes))) {
    text = typed
  }
}

const STEP_MARKS = { "☐": "open", "☒": "done", "☑": "done", "✓": "submit", "✔": "submit" } as const

const STEP_ICONS = {
  open: "lucide:square",
  done: "lucide:square-check",
  submit: "lucide:circle-check",
}

const stepsOf = (line: string) => {
  if (!line.startsWith("←") || !line.endsWith("→")) {
    return null
  }

  const steps: { kind: keyof typeof STEP_ICONS; label: string; done: boolean }[] = []

  for (const char of line.slice(1, -1)) {
    const kind = STEP_MARKS[char as keyof typeof STEP_MARKS]
    const last = steps.at(-1)

    if (kind) {
      steps.push({ kind, label: "", done: kind === "done" })
    } else if (last) {
      last.label += char
    }
  }

  for (const step of steps) {
    step.label = step.label.trim()
  }

  return steps.length > 0 ? steps : null
}

const BORDERS = new Set("─━═-–—┌┐└┘├┤┬┴┼╭╮╰╯↓ ")

const isBorder = (line: string) => [...line].every(c => BORDERS.has(c))

const cellsOf = (line: string) => {
  const cells = line.split("│").map(c => c.replace("↓", "").trim())

  return cells.slice(1, cells.at(-1) === "" ? -1 : undefined)
}

const toMarkdown = (lines: string[]) => {
  const out: string[] = []
  let table = false

  for (const line of lines) {
    if (isBorder(line)) {
      continue
    }

    const cells = line.startsWith("│") ? cellsOf(line) : []

    if (cells.length > 1) {
      out.push(`| ${cells.join(" | ")} |`)

      if (!table) {
        out.push(`|${" --- |".repeat(cells.length)}`)
      }

      table = true
      continue
    }

    if (table) {
      out.push("")
      table = false
    }

    out.push(line.startsWith("│") ? line.slice(1).trim() : line)
  }

  return out.join("\n")
}

const blocks = $derived.by(() => {
  const result: ({ steps: NonNullable<ReturnType<typeof stepsOf>> } | { text: string })[] = []
  let run: string[] = []

  const flush = () => {
    const text = toMarkdown(run).trim()

    if (text) {
      result.push({ text })
    }

    run = []
  }

  for (const line of dialog.lines) {
    const steps = stepsOf(line)

    if (steps) {
      flush()
      result.push({ steps })
    } else {
      run.push(line)
    }
  }

  flush()

  return result
})
</script>

<section class={CARD} aria-label={m.terminal_dialog()}>
  <header class="mb-2 flex items-center gap-2 text-sm font-semibold">
    <Icon icon="lucide:square-terminal" class="size-4 shrink-0 text-primary" />
    <span class="min-w-0 flex-1 truncate">{m.terminal_dialog()}</span>
  </header>
  {#if blocks.length}
    <div class="mb-3 flex max-h-96 flex-col gap-1 overflow-y-auto text-sm text-base-content/80">
      {#each blocks as block, i (i)}
        {#if "steps" in block}
          <ol class="mb-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs">
            {#each block.steps as step, j (j)}
              {#if j > 0}
                <Icon icon="lucide:chevron-right" class="size-3 shrink-0 opacity-40" />
              {/if}
              <li
                class={[
                  "flex items-center gap-1",
                  step.done ? "text-base-content/80" : "text-base-content/55",
                ]}
              >
                <Icon icon={STEP_ICONS[step.kind]} class="size-3.5 shrink-0" />
                {step.label}
              </li>
            {/each}
          </ol>
        {:else}
          <Markdown text={block.text} />
        {/if}
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
          {#if isCheckbox(option.label)}
            <Icon
              icon={option.label.startsWith("[ ]") ? "lucide:square" : "lucide:square-check"}
              class={[
                "mt-0.5 size-4 shrink-0",
                option.label.startsWith("[ ]") ? "opacity-50" : "text-primary",
              ]}
            />
          {/if}
          <span class="flex min-w-0 flex-col">
            <span class="text-sm font-medium break-words">
              {isCheckbox(option.label) ? option.label.slice(3).trim() : option.label}
            </span>
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
    <button type="button" class="btn btn-primary btn-xs" onclick={() => onPress(advance())}>
      {guided ? m.terminal_next() : m.terminal_select()}
    </button>
  </div>
</section>
