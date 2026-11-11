<script lang="ts">
import type { Heading } from "./doc.ts"

let {
  toc,
  active,
  onpick,
}: { toc: Heading[]; active: string; onpick: (id: string) => void } = $props()
</script>

<ul class="flex flex-col text-sm break-keep">
  {#each toc as h (h.id)}
    <li>
      <a
        href={`#${h.id}`}
        class={[
          "flex cursor-pointer gap-2 border-l-2 py-1 pr-2 transition-colors",
          h.depth === 2 ? "pl-3" : "pl-6",
          h.id === active
            ? "border-base-content text-base-content"
            : "text-base-content/60 hover:text-base-content border-transparent",
        ]}
        aria-current={h.id === active ? "location" : undefined}
        onclick={e => {
          e.preventDefault()
          onpick(h.id)
        }}
      >
        <span class="tabular-nums opacity-60">{h.number}.</span>
        <span>{h.text}</span>
      </a>
    </li>
  {/each}
</ul>
