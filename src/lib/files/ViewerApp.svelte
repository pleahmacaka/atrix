<script lang="ts">
import Icon from "@iconify/svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import WindowControls from "#lib/components/ui/WindowControls.svelte"
import { m } from "#lib/paraglide/messages.js"
import { baseName } from "./locations"
import { assetUrl, modelFiles, takeIntent } from "./native"

type Model = { name: string; objUrl: string; mtlUrl?: string }

let model = $state<Model | null>(null)

let failed = $state(false)

takeIntent()
  .then(intent => {
    if (!intent.path) {
      throw new Error("missing")
    }

    return modelFiles(intent.path)
  })
  .then(files => {
    model = {
      name: baseName(files.obj),
      objUrl: assetUrl(files.obj),
      mtlUrl: files.mtl ? assetUrl(files.mtl) : undefined,
    }
  })
  .catch(() => (failed = true))

const name = $derived(model?.name ?? m.files_viewer_title())
</script>

<div class="flex h-full min-h-0 flex-col bg-base-200">
  <header
    class="flex h-8 shrink-0 items-center gap-2 ps-3 pe-1.5 select-none"
    data-tauri-drag-region
  >
    <Icon icon="lucide:box" class="size-4 shrink-0 text-base-content/60" />
    <span class="min-w-0 truncate text-sm" title={name}>{name}</span>
    <div class="h-full min-w-8 flex-1" data-tauri-drag-region></div>
    <WindowControls />
  </header>

  <div class="flex min-h-0 flex-1 px-2 pb-2">
    <main class="island relative min-h-0 min-w-0 flex-1 overflow-hidden">
      {#if model}
        {#await import("#lib/model-viewer/index.ts") then { ModelViewer }}
          <ModelViewer
            objUrl={model.objUrl}
            mtlUrl={model.mtlUrl}
            title={model.name}
          />
        {/await}
      {:else if failed}
        <EmptyState
          icon="lucide:circle-alert"
          text={m.files_states_missing()}
          centered
        />
      {:else}
        <div
          class={[
            "flex size-full flex-col items-center justify-center gap-3",
            "text-sm text-base-content/60",
          ]}
        >
          <span class="loading loading-spinner loading-md text-primary"></span>
          {m.files_viewer_loading()}
        </div>
      {/if}
    </main>
  </div>
</div>
