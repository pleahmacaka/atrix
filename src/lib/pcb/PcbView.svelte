<script lang="ts">
import Icon from "@iconify/svelte"
import { createQuery, keepPreviousData } from "@tanstack/svelte-query"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { m } from "#lib/paraglide/messages.js"
import ArtworkView from "./artwork/ArtworkView.svelte"
import BoardsOverview from "./BoardsOverview.svelte"
import BomTable from "./bom/BomTable.svelte"
import {
  derivedHrefs,
  derivedQuery,
  hrefsQuery,
  loadDerived,
  loadOutputs,
  type Outputs,
  type Status,
  status,
} from "./derived.ts"
import DesignDoc from "./doc/DesignDoc.svelte"
import FeaPanel from "./fea/FeaPanel.svelte"
import { FEA_INDEX } from "./fea/types.ts"
import ZephyrPanel from "./firmware/ZephyrPanel.svelte"
import { fade } from "./motion.ts"
import PcbSource from "./PcbSource.svelte"
import { derive, type Project } from "./pcb.ts"
import QuotePanel from "./quote/QuotePanel.svelte"
import SchematicSheet from "./schematic/SchematicSheet.svelte"
import { loadKit } from "./situation/assets.ts"
import CasePanel from "./situation/CasePanel.svelte"
import SimPanel from "./situation/SimPanel.svelte"
import type { CaseInfo } from "./situation/types.ts"
import StackupPanel from "./stackup/StackupPanel.svelte"
import BoardPanel from "./three/BoardPanel.svelte"
import {
  type BomLine,
  DERIVED,
  type Pcb,
  type SchematicIndex,
  type Stackup,
  type ZephyrReport,
} from "./types.ts"

type Tab =
  | "overview"
  | "3d"
  | "schematic"
  | "artwork"
  | "stackup"
  | "bom"
  | "quote"
  | "situation"
  | "zephyr"
  | "doc"
  | "source"

type TabInfo = { id: Tab; label: () => string; icon: string }

type BoardEntry = { key: string; label: string; outputs: Outputs }

let { project }: { project: Project } = $props()

const QUOTE_TAB: TabInfo = {
  id: "quote",
  label: m.pcb_tab_quote,
  icon: "lucide:receipt",
}

const BOARD_TABS: TabInfo[] = [
  { id: "3d", label: m.pcb_tab_model, icon: "lucide:box" },
  { id: "schematic", label: m.pcb_tab_schematic, icon: "lucide:waypoints" },
  { id: "artwork", label: m.pcb_tab_artwork, icon: "lucide:layers" },
  { id: "stackup", label: m.pcb_tab_stackup, icon: "lucide:layers-3" },
  { id: "bom", label: m.pcb_tab_bom, icon: "lucide:list" },
  { id: "zephyr", label: m.pcb_tab_zephyr, icon: "lucide:cpu" },
  { id: "doc", label: m.pcb_tab_doc, icon: "lucide:file-text" },
  { id: "source", label: m.pcb_tab_source, icon: "lucide:file-code" },
]

const OVERVIEW_TABS: TabInfo[] = [
  { id: "overview", label: m.pcb_tab_overview, icon: "lucide:layout-grid" },
  QUOTE_TAB,
  { id: "situation", label: m.pcb_tab_situation, icon: "lucide:clapperboard" },
]

const CASE_VIEW = "case:"

const FEA_VIEW = "fea"

const ALL = "all"

const MAIN = ""

const COVER = DERIVED.render("iso-top.png")

let tab = $state<Tab>("3d")

let view = $state(MAIN)

const boardsDerive = createQuery(() => ({
  queryKey: ["pcb", project.root, "derive", "boards"],
  queryFn: () => derive(project.root, false),
  staleTime: 30_000,
  refetchOnWindowFocus: true,
}))

const assemblyDerive = createQuery(() => ({
  queryKey: ["pcb", project.root, "derive", "assembly"],
  queryFn: () => derive(project.root, true),
  enabled: !!project.assembly && boardsDerive.isSuccess,
  staleTime: 30_000,
  refetchOnWindowFocus: true,
}))

const boards = createQuery(() => ({
  queryKey: [
    "pcb",
    project.root,
    "outputs",
    boardsDerive.dataUpdatedAt,
  ],
  queryFn: async (): Promise<BoardEntry[]> => {
    const found = boardsDerive.data?.boards ?? []
    const loaded = await Promise.all(
      found.map(([name, dir]) => loadOutputs(`${project.name}:${name}`, dir)),
    )

    return loaded.flatMap((outputs, i) => {
      const meta = project.boards[i]

      return outputs && meta
        ? [
            {
              key: i === 0 ? MAIN : meta.name,
              label: meta.title ?? meta.name,
              outputs,
            },
          ]
        : []
    })
  },
  enabled: boardsDerive.isSuccess,
  placeholderData: keepPreviousData,
  staleTime: Number.POSITIVE_INFINITY,
}))

const assembly = createQuery(() => ({
  queryKey: [
    "pcb",
    project.root,
    "assembly",
    assemblyDerive.dataUpdatedAt,
  ],
  queryFn: () => {
    const dir = assemblyDerive.data?.assembly

    return dir ? loadOutputs(`${project.name}:assembly`, dir) : null
  },
  enabled: assemblyDerive.isSuccess,
  placeholderData: keepPreviousData,
  staleTime: Number.POSITIVE_INFINITY,
}))

const all = $derived(boards.data ?? [])

const caseId = $derived(
  view.startsWith(CASE_VIEW) ? view.slice(CASE_VIEW.length) : null,
)

const current = $derived(
  view === ALL || view === FEA_VIEW || caseId
    ? null
    : (all.find(b => b.key === view) ?? all[0] ?? null),
)

const outputs = () => current?.outputs ?? null

const thumbs = createQuery(() => ({
  queryKey: [
    "pcb",
    project.root,
    "thumbs",
    ...all.map(b => b.outputs.manifest.source.sha256),
  ],
  queryFn: async () =>
    Object.fromEntries(
      await Promise.all(
        all.map(
          async b => [b.key, (await derivedHrefs(b.outputs, [COVER]))[0]] as const,
        ),
      ),
    ),
  enabled: all.length > 1,
  staleTime: Number.POSITIVE_INFINITY,
}))

const cases = createQuery(() => ({
  queryKey: [
    "pcb",
    project.root,
    "cases",
    assembly.data?.manifest.source.sha256,
  ],
  queryFn: async () =>
    assembly.data
      ? ((await loadDerived<CaseInfo[]>(assembly.data, "cases.json")) ?? [])
      : [],
  enabled: !!assembly.data,
  staleTime: Number.POSITIVE_INFINITY,
}))

const stripped = $derived(all.length > 1 || (cases.data?.length ?? 0) > 0)

const tabs = $derived(
  view === ALL
    ? OVERVIEW_TABS
    : [
        ...BOARD_TABS.slice(0, 5),
        ...(stripped ? [] : [QUOTE_TAB]),
        ...BOARD_TABS.slice(5),
      ],
)

const activeTab = $derived(
  tabs.some(t => t.id === tab) ? tab : (tabs[0]?.id ?? "3d"),
)

const kit = createQuery(() => ({
  queryKey: [
    "pcb",
    project.root,
    "kit",
    assembly.data?.manifest.source.sha256,
    ...all.map(b => b.outputs.manifest.source.sha256),
  ],
  queryFn: () => (assembly.data ? loadKit(assembly.data, all) : null),
  enabled:
    !!assembly.data &&
    all.length > 0 &&
    (activeTab === "situation" || !!caseId),
  staleTime: Number.POSITIVE_INFINITY,
}))

const schematic = derivedQuery<SchematicIndex>(
  outputs,
  () => DERIVED.schematic,
  { enabled: () => activeTab === "schematic" },
)

const pcb = derivedQuery<Pcb>(outputs, () => DERIVED.pcb, {
  enabled: () => activeTab === "doc",
})

const bom = derivedQuery<BomLine[]>(outputs, () => DERIVED.bom, {
  enabled: () => activeTab === "bom" || activeTab === "doc",
})

const stackup = derivedQuery<Stackup>(outputs, () => DERIVED.stackup, {
  enabled: () => activeTab === "stackup",
})

const zephyr = derivedQuery<ZephyrReport>(
  outputs,
  () => DERIVED.zephyrReport,
  { enabled: () => activeTab === "zephyr" },
)

const doc = derivedQuery<string>(outputs, () => DERIVED.design, {
  enabled: () => activeTab === "doc",
  body: "text",
})

const cover = hrefsQuery(
  outputs,
  () => [COVER],
  () => activeTab === "doc",
)

const deriving = $derived(boardsDerive.isFetching || assemblyDerive.isFetching)

const failure = $derived(boardsDerive.error ?? assemblyDerive.error)

const docStatus = $derived(status(boards, doc, pcb, bom, cover))

const boardMeta = $derived(
  project.boards.find((b, i) => (i === 0 ? MAIN : b.name) === current?.key) ??
    project.boards[0],
)

const pending = $derived<Status>(
  boardsDerive.isError || boards.isError ? "error" : "pending",
)
</script>

{#snippet placeholder(kind: Status)}
  {#if kind === "error"}
    <div class="flex size-full items-center justify-center p-6">
      <div role="alert" class="alert alert-error alert-soft text-sm">
        {failure?.message ?? m.pcb_load_failed()}
      </div>
    </div>
  {:else if kind === "pending"}
    <div class="grid size-full place-items-center p-4" aria-busy="true">
      <div class="flex flex-col items-center gap-2 text-sm text-base-content/70">
        <span class="loading loading-spinner"></span>
        {deriving ? m.pcb_deriving() : m.pcb_loading()}
      </div>
    </div>
  {:else}
    <EmptyState
      icon="lucide:package-open"
      text={m.pcb_empty()}
      class="size-full justify-center"
    />
  {/if}
{/snippet}

{#snippet chip(selected: boolean, label: string, pick: () => void, icon: string, thumb?: string | null)}
  <button
    type="button"
    class={["btn btn-sm shrink-0 gap-2", selected ? "btn-active" : "btn-ghost"]}
    aria-pressed={selected}
    onclick={pick}
  >
    {#if thumb}
      <img src={thumb} alt="" class="h-6 w-8 rounded-field object-contain" />
    {:else}
      <Icon {icon} class="size-4" />
    {/if}
    <span class="max-w-40 truncate">{label}</span>
  </button>
{/snippet}

<section class="flex size-full min-h-0 min-w-0 flex-col">
  {#if deriving && boards.data}
    <div
      class="flex shrink-0 items-center gap-2 border-b border-base-300 px-3 py-1.5 text-xs text-base-content/70"
      transition:fade
    >
      <span class="loading loading-spinner loading-xs"></span>
      {m.pcb_deriving()}
    </div>
  {:else if failure && boards.data}
    <div
      role="alert"
      class="alert alert-warning alert-soft m-2 text-xs"
      transition:fade
      title={failure.message}
    >
      <Icon icon="lucide:triangle-alert" class="size-4" />
      <span class="line-clamp-2">{failure.message}</span>
    </div>
  {/if}

  {#if stripped}
    <nav
      class="flex shrink-0 gap-1 overflow-x-auto border-b border-base-300 p-2"
      aria-label={m.pcb_boards_and_cases()}
    >
      {@render chip(view === ALL, m.pcb_all(), () => (view = ALL), "lucide:layout-grid")}
      {#each all as b (b.key)}
        {@render chip(
          view === b.key,
          b.label,
          () => (view = b.key),
          "lucide:cpu",
          thumbs.data?.[b.key],
        )}
      {/each}
      {#each cases.data ?? [] as c (c.id)}
        {@render chip(
          caseId === c.id,
          c.title,
          () => (view = `${CASE_VIEW}${c.id}`),
          "lucide:package",
        )}
      {/each}
      {#if assembly.data && FEA_INDEX in assembly.data.manifest.outputs}
        {@render chip(view === FEA_VIEW, m.pcb_fea(), () => (view = FEA_VIEW), "lucide:weight")}
      {/if}
    </nav>
  {/if}

  {#if view === FEA_VIEW && assembly.data}
    <div class="relative min-h-0 flex-1" in:fade>
      <div class="absolute inset-0">
        <FeaPanel assembly={assembly.data} />
      </div>
    </div>
  {:else if caseId}
    {@const info = cases.data?.find(c => c.id === caseId)}
    <div class="relative min-h-0 flex-1" in:fade>
      <div class="absolute inset-0">
        {#if kit.data && info && assembly.data}
          <CasePanel kit={kit.data} {info} assembly={assembly.data} />
        {:else}
          {@render placeholder(kit.isError ? "error" : kit.isPending ? "pending" : "empty")}
        {/if}
      </div>
    </div>
  {:else}
    <div
      role="tablist"
      class="tabs tabs-border shrink-0 flex-nowrap overflow-x-auto border-b border-base-300 px-2"
    >
      {#each tabs as t (t.id)}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === t.id}
          class={["tab shrink-0 gap-2", activeTab === t.id && "tab-active"]}
          onclick={() => (tab = t.id)}
        >
          <Icon icon={t.icon} class="size-4" />
          {t.label()}
        </button>
      {/each}
    </div>

    <div class="relative min-h-0 flex-1">
      {#if activeTab === "source"}
        <div class="absolute inset-0" in:fade>
          {#key boardMeta?.name}
            <PcbSource root={project.root} initial={boardMeta?.circuit ?? null} />
          {/key}
        </div>
      {:else if !current && view !== ALL}
        <div class="absolute inset-0">
          {@render placeholder(pending)}
        </div>
      {:else if activeTab === "overview"}
        <div class="absolute inset-0" in:fade>
          <BoardsOverview
            boards={all}
            title={project.title ?? project.name}
            onselect={key => (view = key)}
          />
        </div>
      {:else if activeTab === "situation"}
        <div class="absolute inset-0" in:fade>
          {#if kit.data}
            <SimPanel kit={kit.data} />
          {:else if assembly.isSuccess && !assembly.data}
            {@render placeholder("empty")}
          {:else}
            {@render placeholder(kit.isError ? "error" : "pending")}
          {/if}
        </div>
      {:else if activeTab === "quote"}
        <div class="absolute inset-0" in:fade>
          {#if all.length > 0}
            <QuotePanel boards={all} storageKey={`atrix-quote:${project.root}`} />
          {:else}
            {@render placeholder(pending)}
          {/if}
        </div>
      {:else if current}
        {#key current.key}
          {#if activeTab === "artwork"}
            <div class="absolute inset-0" in:fade>
              <ArtworkView outputs={current.outputs} {placeholder} />
            </div>
          {:else if activeTab === "stackup"}
            <div class="absolute inset-0" in:fade>
              {#if stackup.data}
                <StackupPanel stackup={stackup.data} />
              {:else if !current.outputs.manifest.outputs[DERIVED.stackup]}
                {@render placeholder("empty")}
              {:else}
                {@render placeholder(status(stackup))}
              {/if}
            </div>
          {:else if activeTab === "3d"}
            <div class="absolute inset-0" in:fade>
              <BoardPanel outputs={current.outputs} {placeholder} />
            </div>
          {:else if activeTab === "schematic"}
            <div class="absolute inset-0" in:fade>
              {#if schematic.data}
                <SchematicSheet
                  index={schematic.data}
                  outputs={current.outputs}
                  title={project.title ?? project.name}
                />
              {:else}
                {@render placeholder(status(schematic))}
              {/if}
            </div>
          {:else if activeTab === "bom"}
            <div class="absolute inset-0" in:fade>
              {#if bom.data}
                <BomTable
                  lines={bom.data}
                  title={project.title ?? project.name}
                  outputs={current.outputs}
                  onlocate={() => (tab = "3d")}
                />
              {:else}
                {@render placeholder(status(bom))}
              {/if}
            </div>
          {:else if activeTab === "zephyr"}
            <div class="absolute inset-0" in:fade>
              {#if zephyr.data}
                <ZephyrPanel
                  report={zephyr.data}
                  outputs={current.outputs}
                  title={project.title ?? project.name}
                />
              {:else}
                {@render placeholder(status(zephyr))}
              {/if}
            </div>
          {:else if activeTab === "doc"}
            <div class="absolute inset-0" in:fade>
              {#if doc.data && docStatus !== "pending"}
                <DesignDoc
                  markdown={doc.data}
                  title={project.title ?? project.name}
                  pcb={pcb.data ?? null}
                  bom={bom.data ?? null}
                  cover={cover.data?.[0] ?? null}
                />
              {:else}
                {@render placeholder(docStatus)}
              {/if}
            </div>
          {/if}
        {/key}
      {/if}
    </div>
  {/if}
</section>
