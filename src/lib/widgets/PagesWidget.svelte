<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import { PAGES } from "#lib/store/pages.ts"
import type { WidgetLeaf } from "./layout.svelte.ts"

let { leaf: _leaf }: { leaf: WidgetLeaf } = $props()

</script>

<nav class="flex shrink-0 flex-wrap items-center gap-1 p-1" aria-label={m.shell_pages()}>
  {#each PAGES as page (page.id)}
    <button
      type="button"
      class={[
        "btn btn-ghost btn-sm btn-square transition-colors",
        nav.page === page.id && "bg-primary/10 text-primary hover:bg-primary/10",
      ]}
      aria-label={page.label()}
      title={page.label()}
      aria-current={nav.page === page.id ? "page" : undefined}
      onclick={() => {
        nav.page = page.id
      }}
    >
      <Icon icon={page.icon} class="size-4" />
    </button>
  {/each}
  <span class="flex-1"></span>
  <button
    type="button"
    class="btn btn-ghost btn-sm btn-square"
    aria-label={m.common_settings()}
    title="{m.common_settings()} (Ctrl+,)"
    onclick={() => {
      nav.settings = true
    }}
  >
    <Icon icon="lucide:settings" class="size-4" />
  </button>
</nav>
