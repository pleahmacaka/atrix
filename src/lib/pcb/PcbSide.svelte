<script lang="ts">
import Icon from "@iconify/svelte"
import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query"
import { m } from "#lib/paraglide/messages.js"
import PcbView from "./PcbView.svelte"
import { findProject, type Project } from "./pcb.ts"

let { cwd }: { cwd: string } = $props()

// tracked-props mode skips updates for fields first read after the fetch settled
const client = new QueryClient({
  defaultOptions: { queries: { notifyOnChangeProps: "all" } },
})

let project = $state<Project | null>(null)

let open = $state(true)

let wide = $state(false)

$effect(() => {
  const target = cwd

  project = null

  findProject(target)
    .then(found => {
      if (cwd === target) {
        project = found
      }
    })
    .catch(() => (project = null))
})
</script>

{#if project}
  {#if open}
    <aside
      class={[
        "flex min-w-80 shrink-0 flex-col border-l border-base-300 bg-base-100",
        "transition-[width] duration-140",
        wide ? "w-2/3" : "w-1/2 max-w-3xl",
      ]}
    >
      <header class="flex items-center gap-1 border-b border-base-300 py-1 ps-3 pe-1">
        <Icon icon="lucide:circuit-board" class="size-4 shrink-0 opacity-70" />
        <span class="min-w-0 flex-1 truncate text-sm font-semibold" title={project.root}>
          {project.title ?? project.name}
        </span>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          aria-label={wide ? m.pcb_narrow() : m.pcb_widen()}
          title={wide ? m.pcb_narrow() : m.pcb_widen()}
          aria-pressed={wide}
          onclick={() => (wide = !wide)}
        >
          <Icon
            icon={wide ? "lucide:minimize-2" : "lucide:maximize-2"}
            class="size-4"
          />
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-square"
          aria-label={m.pcb_hide()}
          title={m.pcb_hide()}
          onclick={() => (open = false)}
        >
          <Icon icon="lucide:panel-right-close" class="size-4" />
        </button>
      </header>
      <div class="@container min-h-0 flex-1">
        <QueryClientProvider {client}>
          {#key project.root}
            <PcbView {project} />
          {/key}
        </QueryClientProvider>
      </div>
    </aside>
  {:else}
    <div class="flex shrink-0 flex-col border-l border-base-300 p-1">
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label={m.pcb_show()}
        title={m.pcb_show()}
        onclick={() => (open = true)}
      >
        <Icon icon="lucide:circuit-board" class="size-4" />
      </button>
    </div>
  {/if}
{/if}
