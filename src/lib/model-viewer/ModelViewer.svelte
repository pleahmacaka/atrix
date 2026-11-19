<script lang="ts">
import Icon from "@iconify/svelte"
import { Canvas } from "@threlte/core"
import { NeutralToneMapping } from "three"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Popover from "#lib/components/ui/Popover.svelte"
import Segmented from "#lib/components/ui/Segmented.svelte"
import { m } from "#lib/paraglide/messages.js"
import { fade } from "#lib/pcb/motion.ts"
import { currentLocale } from "#lib/store/locale.ts"
import { fetchText, loadModel } from "./load"
import {
  disposeMaterials,
  disposeModel,
  type MaterialSet,
  type Model,
  parseMaterials,
} from "./mesh"
import { baseName, fileName, type ObjScan, resolveAsset } from "./model"
import Scene from "./Scene.svelte"

let {
  objUrl,
  mtlUrl = null,
  title,
  onfullscreen,
}: {
  objUrl: string
  mtlUrl?: string | null
  title?: string
  onfullscreen?: (fullscreen: boolean) => void
} = $props()

const BACKDROPS = {
  white: { surface: "bg-zinc-100", cell: "#d4d4d8", section: "#a1a1aa" },
  gray: { surface: "bg-zinc-600", cell: "#71717a", section: "#a1a1aa" },
  black: { surface: "bg-zinc-950", cell: "#27272a", section: "#3f3f46" },
}

type Backdrop = keyof typeof BACKDROPS

const BACKDROP_KEYS = Object.keys(BACKDROPS) as Backdrop[]

const BACKDROP_LABELS: Record<Backdrop, () => string> = {
  white: m.files_model_white,
  gray: m.files_model_gray,
  black: m.files_model_black,
}

const VIEW_KEY = "atrix-model-viewer.view"

const heading = $derived(title ?? fileName(objUrl))

let status = $state<"loading" | "ready" | "error">("loading")

let progress = $state<number | null>(null)

let failure = $state("")

let model = $state.raw<Model | null>(null)

let scan = $state.raw<ObjScan | null>(null)

let bytes = $state(0)

let materials = $state.raw<MaterialSet | null>(null)

let materialMissing = $state(false)

let revision = $state(0)

let wireframe = $state(false)

let flat = $state(false)

let fullscreen = $state(false)

let dragging = $state(false)

let detailsOpen = $state(false)

let viewOpen = $state(false)

let shell = $state<HTMLElement>()

let picker = $state<HTMLInputElement>()

let scene = $state<ReturnType<typeof Scene>>()

const stored = (() => {
  try {
    return JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null") ?? {}
  } catch {
    return {}
  }
})()

const view = $state({
  backdrop: BACKDROP_KEYS.includes(stored.backdrop)
    ? (stored.backdrop as Backdrop)
    : "gray",
  guides: typeof stored.guides === "boolean" ? stored.guides : true,
  lighting: typeof stored.lighting === "boolean" ? stored.lighting : true,
  brightness: typeof stored.brightness === "number" ? stored.brightness : 1,
})

$effect(() => {
  localStorage.setItem(VIEW_KEY, JSON.stringify(view))
})

const ready = $derived(status === "ready")

const textures = new Map<string, string>()

let source: { text: string; base: string } | null = null

const count = (n: number) => n.toLocaleString(currentLocale())

const fileSize = (n: number) => {
  const mega = n >= 1024 ** 2

  return new Intl.NumberFormat(currentLocale(), {
    style: "unit",
    unit: mega ? "megabyte" : "kilobyte",
    maximumFractionDigits: 1,
  }).format(n / (mega ? 1024 ** 2 : 1024))
}

const facts = $derived(
  model && scan
    ? [
        [m.files_model_file(), heading],
        [m.files_columns_size(), fileSize(bytes)],
        [m.files_model_vertices(), count(scan.vertices)],
        [m.files_model_faces(), count(scan.faces)],
        [m.files_model_objects(), count(model.slots.length)],
        [
          m.files_model_materials(),
          materials
            ? count(Object.keys(materials.materialsInfo).length)
            : m.files_model_none(),
        ],
        [
          m.files_model_dimensions(),
          model.size
            .map(n =>
              n.toLocaleString(currentLocale(), { maximumFractionDigits: 2 }),
            )
            .join(" × "),
        ],
      ]
    : [],
)

const applyMaterials = (body: string, base: string) => {
  if (materials) {
    disposeMaterials(materials)
  }

  source = { text: body, base }
  materials = parseMaterials(
    body,
    ref =>
      textures.get(baseName(ref).toLowerCase()) ??
      resolveAsset(ref, base) ??
      ref,
    () => revision++,
  )
  materialMissing = false
}

const releaseMaterials = () => {
  if (materials) {
    disposeMaterials(materials)
  }

  for (const url of textures.values()) {
    URL.revokeObjectURL(url)
  }

  textures.clear()
  materials = null
  source = null
  materialMissing = false
}

$effect(() => {
  const url = objUrl
  const explicit = mtlUrl
  const controller = new AbortController()
  const { signal } = controller
  let loaded: Model | null = null

  status = "loading"
  progress = null

  loadModel(url, signal, ratio => (progress = ratio))
    .then(result => {
      if (signal.aborted) {
        disposeModel(result.model)

        return
      }

      loaded = result.model
      model = result.model
      scan = result.scan
      bytes = result.bytes
      status = "ready"

      const library = result.scan.libraries[0]
      const mtl =
        explicit ??
        (library === undefined ? undefined : resolveAsset(library, url))

      if (mtl === undefined) {
        return
      }

      materialMissing = true

      if (mtl) {
        fetchText(mtl, signal)
          .then(body => {
            if (!signal.aborted) {
              applyMaterials(body, mtl)
            }
          })
          .catch(() => undefined)
      }
    })
    .catch(error => {
      if (!signal.aborted) {
        failure = error instanceof Error ? error.message : String(error)
        status = "error"
      }
    })

  return () => {
    controller.abort()
    releaseMaterials()

    if (loaded) {
      disposeModel(loaded)
    }

    model = null
    scan = null
  }
})

const attach = async (files: File[]) => {
  const mtl = files.find(f => f.name.toLowerCase().endsWith(".mtl"))
  const body = mtl ? await mtl.text() : source?.text

  if (body === undefined || !model) {
    return
  }

  for (const file of files) {
    if (file === mtl) {
      continue
    }

    const name = file.name.toLowerCase()
    const previous = textures.get(name)

    if (previous) {
      URL.revokeObjectURL(previous)
    }

    textures.set(name, URL.createObjectURL(file))
  }

  applyMaterials(body, mtl ? objUrl : (source?.base ?? objUrl))
}

const toggleFullscreen = () => {
  if (onfullscreen) {
    fullscreen = !fullscreen
    onfullscreen(fullscreen)
  } else if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => undefined)
  } else {
    shell?.requestFullscreen().catch(() => undefined)
  }
}

const onkeydown = (e: KeyboardEvent) => {
  const leaving = e.key === "Escape" && fullscreen && onfullscreen

  if (e.key === "F11" || leaving) {
    e.preventDefault()
    toggleFullscreen()
  }
}

const carriesFiles = (e: DragEvent) =>
  e.dataTransfer?.types.includes("Files") ?? false

const ondragover = (e: DragEvent) => {
  if (carriesFiles(e)) {
    e.preventDefault()
    dragging = status === "ready"
  }
}

const ondragleave = (e: DragEvent & { currentTarget: HTMLElement }) => {
  const inside =
    e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)

  if (!inside) {
    dragging = false
  }
}

const ondrop = (e: DragEvent) => {
  if (!carriesFiles(e)) {
    return
  }

  e.preventDefault()

  if (dragging) {
    dragging = false
    attach(Array.from(e.dataTransfer?.files ?? []))
  }
}

const onpick = (e: Event & { currentTarget: HTMLInputElement }) => {
  attach(Array.from(e.currentTarget.files ?? []))
  e.currentTarget.value = ""
}

const pressed = (on: boolean) =>
  on ? "bg-primary/8 text-primary" : undefined
</script>

<svelte:window {onkeydown} />

<svelte:document
  onfullscreenchange={() => {
    if (!onfullscreen) {
      fullscreen = document.fullscreenElement === shell
    }
  }}
/>

{#snippet toggle(label: string, checked: boolean, set: (on: boolean) => void)}
  <label
    class={[
      "flex min-h-8 cursor-pointer items-center justify-between gap-3",
      "rounded-field px-2 transition-colors duration-140",
      "hover:bg-base-content/8",
    ]}
  >
    <span class="min-w-0 truncate">{label}</span>
    <input
      type="checkbox"
      class="toggle toggle-sm toggle-primary shrink-0"
      {checked}
      onchange={e => set(e.currentTarget.checked)}
    />
  </label>
{/snippet}

<section
  bind:this={shell}
  aria-label={heading}
  class={[
    "relative size-full overflow-hidden text-base-content",
    "transition-colors duration-140",
    BACKDROPS[view.backdrop].surface,
  ]}
  {ondragover}
  {ondragleave}
  {ondrop}
>
  {#if model}
    <div class="absolute inset-0">
      <Canvas toneMapping={NeutralToneMapping}>
        <Scene
          bind:this={scene}
          {model}
          {materials}
          {revision}
          {wireframe}
          {flat}
          guides={view.guides}
          gridColors={BACKDROPS[view.backdrop]}
          lighting={view.lighting}
          brightness={view.brightness}
        />
      </Canvas>
    </div>
  {/if}

  {#if status === "loading"}
    <div class="absolute inset-0 grid place-items-center">
      <div class="island flex w-52 flex-col items-center gap-3 p-4">
        <span class="text-sm text-base-content/70">
          {m.files_viewer_loading()}
        </span>
        {#if progress === null}
          <progress class="progress progress-primary w-full"></progress>
        {:else}
          <progress
            class="progress progress-primary w-full"
            value={progress}
            max="1"
          ></progress>
        {/if}
      </div>
    </div>
  {:else if status === "error"}
    <div class="absolute inset-0 grid place-items-center p-6">
      <div class="island max-w-sm px-5">
        <EmptyState
          icon="lucide:triangle-alert"
          title={m.files_model_load_failed()}
          text={failure}
          class="break-all"
        />
      </div>
    </div>
  {/if}

  <div
    role="toolbar"
    aria-label={heading}
    class="island absolute top-2 right-2 flex items-center gap-0.5 p-1"
  >
    <IconButton
      icon="lucide:info"
      label={m.files_model_details()}
      aria-pressed={detailsOpen}
      disabled={!ready}
      class={pressed(detailsOpen && ready)}
      onclick={() => (detailsOpen = !detailsOpen)}
    />
    <Popover
      label={m.files_model_view()}
      placement="bottom-end"
      width="w-72"
      bind:open={viewOpen}
    >
      {#snippet trigger(props)}
        <IconButton
          icon="lucide:layers"
          label={m.files_model_view()}
          class={pressed(viewOpen)}
          {...props}
        />
      {/snippet}
      <div class="flex flex-col gap-3 p-1">
        <div class="flex flex-col gap-2 px-2 pt-1">
          <span class="text-xs font-medium text-base-content/60">
            {m.files_model_background()}
          </span>
          <Segmented
            label={m.files_model_background()}
            items={BACKDROP_KEYS.map(key => ({
              id: key,
              label: BACKDROP_LABELS[key](),
            }))}
            value={view.backdrop}
            onpick={key => (view.backdrop = key)}
          />
        </div>
        <div class="flex flex-col">
          {@render toggle(m.files_model_guides(), view.guides, on => {
            view.guides = on
          })}
          {@render toggle(m.files_model_lighting(), view.lighting, on => {
            view.lighting = on
          })}
          <label class="flex flex-col gap-2 px-2 py-2">
            <span class="flex justify-between gap-3">
              <span class="min-w-0 truncate">{m.files_model_brightness()}</span>
              <span class="shrink-0 text-base-content/60 tabular-nums">
                {Math.round(view.brightness * 100)}%
              </span>
            </span>
            <input
              type="range"
              class="range range-primary range-xs w-full"
              min="0.2"
              max="2"
              step="0.05"
              aria-label={m.files_model_brightness()}
              bind:value={view.brightness}
            />
          </label>
        </div>
        <div class="flex flex-col">
          {@render toggle(m.files_model_wireframe(), wireframe, on => {
            wireframe = on
          })}
          {@render toggle(m.files_model_flat_shading(), flat, on => {
            flat = on
          })}
        </div>
      </div>
    </Popover>
    <IconButton
      icon="lucide:palette"
      label={m.files_model_attach_material()}
      disabled={!ready}
      onclick={() => picker?.click()}
    />
    <IconButton
      icon="lucide:rotate-ccw"
      label={m.files_model_reset_view()}
      disabled={!ready}
      onclick={() => scene?.frame()}
    />
    <IconButton
      icon={fullscreen ? "lucide:minimize" : "lucide:maximize"}
      label={fullscreen
        ? m.files_model_exit_fullscreen()
        : m.files_model_fullscreen()}
      onclick={toggleFullscreen}
    />
  </div>

  {#if detailsOpen && ready}
    <div
      class="island absolute top-2 left-2 w-64 max-w-viewport p-3 text-xs"
      transition:fade
    >
      <dl class="flex flex-col gap-1.5">
        {#each facts as [label, value] (label)}
          <div class="flex min-w-0 gap-3">
            <dt class="w-20 shrink-0 truncate text-base-content/60">{label}</dt>
            <dd class="min-w-0 flex-1 truncate tabular-nums" title={value}>
              {value}
            </dd>
          </div>
        {/each}
      </dl>
    </div>
  {/if}

  {#if materialMissing && ready}
    <div class="absolute inset-x-0 bottom-2 flex justify-center px-2">
      <div
        class="island flex min-w-0 items-center gap-2 py-1 ps-3 pe-1 text-xs"
        transition:fade
      >
        <span class="min-w-0 truncate text-base-content/70">
          {m.files_model_material_missing()}
        </span>
        <button
          type="button"
          class="btn btn-ghost btn-xs shrink-0"
          onclick={() => picker?.click()}
        >
          {m.files_model_attach_material()}
        </button>
      </div>
    </div>
  {/if}

  {#if dragging}
    <div
      class={[
        "pointer-events-none absolute inset-2 grid place-items-center",
        "rounded-box border-2 border-dashed border-primary/60",
        "bg-base-100/70 backdrop-blur-sm",
      ]}
      transition:fade
    >
      <div class="flex flex-col items-center gap-2 text-sm">
        <Icon icon="lucide:palette" class="size-6 text-primary" />
        <span>{m.files_model_drop_hint()}</span>
      </div>
    </div>
  {/if}

  <input
    bind:this={picker}
    type="file"
    accept=".mtl,image/*"
    multiple
    hidden
    onchange={onpick}
  />
</section>
