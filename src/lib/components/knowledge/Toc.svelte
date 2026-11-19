<script lang="ts">
let { markdown, root }: { markdown: string; root: HTMLElement | null } = $props()

type Heading = { level: number; text: string }

const FENCE = "```"

const headings = $derived.by(() => {
  let fenced = false
  const found: Heading[] = []

  for (const line of markdown.split("\n")) {
    if (line.trimStart().startsWith(FENCE)) {
      fenced = !fenced
    }

    const level = line.length - line.replace(/^#+/, "").length

    if (!fenced && level >= 2 && level <= 4 && line[level] === " ") {
      found.push({ level, text: line.slice(level + 1).trim() })
    }
  }

  return found
})

const numbered = $derived.by(() => {
  const counters = [0, 0, 0]
  const top = Math.min(...headings.map(h => h.level))

  return headings.map(heading => {
    const depth = Math.min(heading.level - top, 2)

    counters[depth]++
    counters.fill(0, depth + 1)

    return { ...heading, depth, number: counters.slice(0, depth + 1).join(".") }
  })
})

const INDENT = ["ps-2", "ps-5", "ps-8"]

const jump = (index: number) =>
  root?.querySelectorAll("h2, h3, h4")[index]?.scrollIntoView({ behavior: "smooth", block: "start" })
</script>

<ol class="grid gap-0.5 text-sm">
  {#each numbered as heading, i (i)}
    <li>
      <button
        type="button"
        class={[
          "flex w-full cursor-pointer gap-2 rounded-field py-1.5 pe-2 text-start",
          "text-base-content/65 transition-colors duration-140 hover:bg-base-content/8",
          "hover:text-base-content",
          INDENT[heading.depth],
        ]}
        onclick={() => jump(i)}
      >
        <span class="shrink-0 text-base-content/40 tabular-nums">{heading.number}.</span>
        <span class="min-w-0 truncate">{heading.text}</span>
      </button>
    </li>
  {/each}
</ol>