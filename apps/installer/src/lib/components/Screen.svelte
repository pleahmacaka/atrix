<script lang="ts">
import type { Snippet } from "svelte"

let {
  title,
  lead,
  children,
  actions,
}: {
  title: string
  lead?: string
  children?: Snippet
  actions?: Snippet
} = $props()
</script>

<main class="flex h-dvh flex-col gap-4 bg-base-200 p-5 text-base-content">
  <header class="flex min-w-0 flex-col px-1">
    <h1 class="truncate text-lg font-semibold">{title}</h1>
    {#if lead}
      <p class="text-sm text-base-content/60">{lead}</p>
    {/if}
  </header>
  <section class="-m-3 flex min-h-0 grow flex-col gap-3 overflow-y-auto p-3">
    {@render children?.()}
  </section>
  {#if actions}
    <footer class="flex items-center justify-end gap-2">
      {@render actions()}
    </footer>
  {/if}
</main>
