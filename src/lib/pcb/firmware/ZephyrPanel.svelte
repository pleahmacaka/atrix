<script lang="ts">
import Icon from "@iconify/svelte"
import { createQuery } from "@tanstack/svelte-query"
import Markdown from "#lib/components/chat/Markdown.svelte"
import CopyButton from "#lib/components/ui/CopyButton.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import Select from "#lib/components/ui/Select.svelte"
import { m } from "#lib/paraglide/messages.js"
import { baseName } from "#lib/path.ts"
import { derivedQuery, keyOf, loadDerived, type Outputs } from "../derived.ts"
import { saveFile } from "../save.ts"
import {
  DERIVED,
  type ZephyrNode,
  type ZephyrReport,
  type ZephyrUnresolved,
} from "../types.ts"
import { highlight, languageOf, type Token } from "./highlight.ts"
import {
  downloadProject,
  type Focus,
  flatten,
  KINDS,
  linesOf,
  mentions,
  netFocus,
  nodeFocus,
  related,
  starterHref,
  type TreeNode,
  treeOf,
  zephyrFiles,
} from "./zephyr.ts"

let {
  report,
  outputs,
  title,
}: { report: ZephyrReport; outputs: Outputs; title: string } = $props()

type Hover = { file: string } | { focus: Focus } | null

let selected = $state("")

let pane = $state<"files" | "nodes">("files")

let zipping = $state(false)

let zipFailed = $state(false)

let panel = $state(true)

let hovered = $state<Hover>(null)
let dark = $state(document.documentElement.dataset.theme === "atrix-dark")

$effect(() => {
  const root = document.documentElement
  const read = () => {
    dark = root.dataset.theme === "atrix-dark"
  }
  const observer = new MutationObserver(read)

  observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] })

  return () => observer.disconnect()
})

const tintOf = (token: Token) => (dark ? token.dark : token.light)

const tree = $derived(treeOf(zephyrFiles(outputs)))

const files = $derived(flatten(tree))

const boardDts = $derived(`boards/${report.vendor}/${report.board}/${report.board}.dts`)

const current = $derived(
  files.includes(selected) ? selected : files.includes(boardDts) ? boardDts : (files[0] ?? ""),
)

const body = derivedQuery<string>(
  () => outputs,
  () => DERIVED.zephyr(current),
  { body: "text", enabled: () => current !== "" },
)

const lines = $derived(body.data ? linesOf(body.data) : [])

const markdown = $derived(current.toLowerCase().endsWith(".md"))

const lang = $derived(languageOf(current))

const colored = createQuery(() => ({
  queryKey: keyOf(outputs, "highlight", [current, lang ?? ""]),
  queryFn: () => highlight(body.data ?? "", lang ?? "c"),
  enabled: !!body.data && !!lang && !markdown,
  staleTime: Number.POSITIVE_INFINITY,
}))

const texts = createQuery(() => ({
  queryKey: keyOf(outputs, "texts", files.map(DERIVED.zephyr)),
  queryFn: async () => {
    const loaded = await Promise.all(
      files.map(f => loadDerived<string>(outputs, DERIVED.zephyr(f), "text")),
    )

    return Object.fromEntries(files.map((f, i) => [f, linesOf(loaded[i] ?? "")]))
  },
  staleTime: Number.POSITIVE_INFINITY,
}))

const nodeKey = (n: ZephyrNode) => `${n.id}:${n.parts.join(",")}`

const mentionedIn = (file: string, focus: Focus) =>
  (texts.data?.[file] ?? []).some(line => mentions(focus, line))

const hits = $derived.by(() => {
  const h = hovered

  const touches = (focus: Focus) =>
    h === null ? false : "file" in h ? mentionedIn(h.file, focus) : related(h.focus, focus)

  const matchedFiles =
    h === null ? [] : "file" in h ? [h.file] : files.filter(f => mentionedIn(f, h.focus))

  const matchedLines =
    h === null || "file" in h ? [] : lines.flatMap((line, i) => (mentions(h.focus, line) ? [i] : []))

  return {
    nodes: new Set(report.nodes.filter(n => touches(nodeFocus(n))).map(nodeKey)),
    nets: new Set(report.unresolved.filter(u => touches(netFocus(u))).map(u => u.pad)),
    files: new Set(matchedFiles),
    lines: new Set(matchedLines),
  }
})

const hover = (target: Hover) => () => {
  hovered = target
}

const hoverNode = (n: ZephyrNode) => hover({ focus: nodeFocus(n) })

const hoverNet = (u: ZephyrUnresolved) => hover({ focus: netFocus(u) })

const name = $derived(title.trim() || "board")

const zipProject = async () => {
  zipping = true
  zipFailed = false

  try {
    await downloadProject(outputs, report)
  } catch {
    zipFailed = true
  } finally {
    zipping = false
  }
}
</script>

{#snippet branch(items: TreeNode[])}
  {#each items as item (item.path)}
    <li>
      {#if item.children.length > 0}
        <details open>
          <summary class="break-all">
            <Icon icon="lucide:folder" class="size-4 shrink-0 opacity-60" />
            {item.name}
          </summary>
          <ul>{@render branch(item.children)}</ul>
        </details>
      {:else}
        <button
          type="button"
          class={[
            "break-all",
            current === item.path && "menu-active",
            current !== item.path && hits.files.has(item.path) && "bg-primary/15",
          ]}
          onclick={() => (selected = item.path)}
          onmouseenter={hover({ file: item.path })}
          onmouseleave={hover(null)}
          onfocus={hover({ file: item.path })}
          onblur={hover(null)}
        >
          <Icon icon="lucide:file-code" class="size-4 shrink-0 opacity-60" />
          {item.name}
        </button>
      {/if}
    </li>
  {/each}
{/snippet}

<div class="flex size-full min-h-0 flex-col">
  <div class="border-base-300 flex flex-wrap items-end gap-2 border-b p-4">
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <h3 class="truncate text-lg font-semibold">{m.pcb_zephyr_title({ name })}</h3>
      <p class="text-base-content/70 text-sm">
        {m.pcb_zephyr_base({ module: report.module, base: report.base })}
      </p>
      <p class="text-base-content/70 text-sm">
        <a class="link" href={starterHref(report)} target="_blank" rel="noreferrer">zephyr-flake-starter</a>
        @ <span class="tabular-nums">{report.starter.sha.slice(0, 7)}</span>
        {m.pcb_zephyr_changed_files()}
      </p>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" disabled={zipping} onclick={zipProject}>
      {#if zipping}
        <span class="loading loading-spinner loading-xs"></span>
      {:else}
        <Icon icon="lucide:file-archive" class="size-4" />
      {/if}
      {m.pcb_zephyr_download_project()}
    </button>
  </div>

  {#if zipFailed}
    <div role="alert" class="alert alert-error alert-soft m-2 text-sm">
      {m.pcb_zephyr_download_failed()}
    </div>
  {/if}

  <div role="tablist" class="tabs tabs-border border-base-300 shrink-0 border-b px-2 @5xl:hidden">
    <button
      type="button"
      role="tab"
      aria-selected={pane === "files"}
      class={["tab gap-2", pane === "files" && "tab-active"]}
      onclick={() => (pane = "files")}
    >
      <Icon icon="lucide:files" class="size-4" />
      {m.pcb_zephyr_files()}
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={pane === "nodes"}
      class={["tab gap-2", pane === "nodes" && "tab-active"]}
      onclick={() => (pane = "nodes")}
    >
      <Icon icon="lucide:cpu" class="size-4" />
      {m.pcb_zephyr_peripherals()}
      {#if report.unresolved.length > 0}
        <Icon icon="lucide:triangle-alert" class="text-warning size-4" />
      {/if}
    </button>
  </div>

  <div class="flex min-h-0 flex-1">
    <div class={["min-h-0 min-w-0 flex-1", pane === "files" ? "flex" : "hidden @5xl:flex"]}>
      <nav class="border-base-300 hidden w-60 shrink-0 overflow-y-auto border-r @2xl:block" aria-label={m.pcb_zephyr_generated_files()}>
        <ul class="menu menu-sm w-full">{@render branch(tree)}</ul>
      </nav>

      <div class="flex min-w-0 flex-1 flex-col">
        <div class="border-base-300 flex h-12 shrink-0 items-center gap-1 border-b px-4">
          <div class="min-w-0 flex-1 @2xl:hidden">
            <Select
              class="select-sm w-full"
              label={m.pcb_zephyr_pick_file()}
              options={files.map(f => ({ value: f, label: f }))}
              value={current}
              onchange={v => (selected = v)}
            />
          </div>
          <span class="hidden min-w-0 flex-1 truncate text-sm font-medium @2xl:block" title={current}>
            {current}
          </span>
          {#if body.data !== undefined && body.data !== null}
            <CopyButton text={body.data} />
            <IconButton
              icon="lucide:download"
              label={m.pcb_zephyr_download_file()}
              onclick={() => saveFile(body.data ?? "", baseName(current))}
            />
          {/if}
          {#if !panel}
            <IconButton
              icon="lucide:panel-right-open"
              label={m.pcb_fea_expand_panel()}
              class="hidden @5xl:inline-flex"
              onclick={() => (panel = true)}
            />
          {/if}
        </div>

        <div class="min-h-0 flex-1 overflow-auto">
          {#if body.isError}
            <p role="alert" class="text-error p-4 text-sm">
              {m.pcb_zephyr_load_failed()}
            </p>
          {:else if body.isLoading}
            <div class="flex flex-col gap-2 p-4" aria-busy="true">
              {#each ["w-3/4", "w-1/2", "w-2/3", "w-1/3", "w-1/2"] as w, i (i)}
                <div class={["skeleton h-4", w]}></div>
              {/each}
            </div>
          {:else if markdown}
            <div class="mx-auto max-w-3xl p-6">
              <Markdown text={body.data ?? ""} />
            </div>
          {:else}
            <div class="min-w-max py-3 text-sm leading-relaxed tabular-nums" style:tab-size="4">
              {#each lines as line, i (i)}
                {@const tokens = colored.data?.[i]}
                <div class={["flex", hits.lines.has(i) && "bg-primary/15"]}>
                  <span
                    class="text-base-content/40 border-base-300 w-12 shrink-0 border-r pr-3 text-right select-none"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  {#if tokens}
                    <span class="px-4 whitespace-pre">{#each tokens as t, j (j)}<span style:color={tintOf(t)}>{t.content}</span>{/each}</span>
                  {:else}
                    <span class="px-4 whitespace-pre">{line}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <aside
      class={[
        "min-h-0 overflow-y-auto break-keep @5xl:w-96 @5xl:shrink-0 @5xl:border-l @5xl:border-base-300",
        pane === "nodes" ? "block flex-1 @5xl:flex-none" : "hidden @5xl:block",
        !panel && "@5xl:hidden",
      ]}
      aria-label={m.pcb_zephyr_inferred()}
    >
      <div class="flex flex-col gap-4 p-4">
        <div class="hidden items-center justify-between @5xl:flex">
          <span class="text-sm font-semibold">{m.pcb_zephyr_peripherals()}</span>
          <IconButton
            icon="lucide:panel-right-close"
            label={m.pcb_fea_collapse_panel()}
            onclick={() => (panel = false)}
          />
        </div>

        {#if report.unresolved.length > 0}
          <div role="alert" class="alert alert-warning alert-soft items-start text-sm">
            <Icon icon="lucide:triangle-alert" class="size-5 shrink-0" />
            <div class="flex min-w-0 flex-col gap-2">
              <span class="font-semibold">{m.pcb_zephyr_unresolved({ count: report.unresolved.length })}</span>
              <p>{m.pcb_zephyr_unresolved_hint()}</p>
              <ul class="flex flex-col gap-1 tabular-nums">
                {#each report.unresolved as u (u.pad)}
                  <li
                    class={[
                      "-mx-2 flex flex-wrap gap-x-2 rounded-field px-2 py-1",
                      hits.nets.has(u.pad) && "bg-warning/25",
                    ]}
                    onmouseenter={hoverNet(u)}
                    onmouseleave={hover(null)}
                  >
                    <span class="font-medium">{u.net}</span>
                    <span class="text-base-content/70">{m.pcb_zephyr_pad_pin({ pad: u.pad, pin: u.pin })}</span>
                    {#if u.parts.length > 0}
                      <span class="text-base-content/70">{u.parts.join(", ")}</span>
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        {:else}
          <p class="text-base-content/70 flex items-center gap-2 text-sm">
            <Icon icon="lucide:circle-check" class="text-success size-4" />
            {m.pcb_zephyr_no_unresolved()}
          </p>
        {/if}

        {#each report.nodes as n (nodeKey(n))}
          <section
            class={[
              "rounded-box border transition-colors",
              hits.nodes.has(nodeKey(n)) ? "border-primary bg-primary/5" : "border-base-300",
            ]}
            aria-label={KINDS[n.kind].label()}
            onmouseenter={hoverNode(n)}
            onmouseleave={hover(null)}
          >
            <header class="border-base-300 flex h-10 items-center gap-2 border-b px-4">
              <Icon icon={KINDS[n.kind].icon} class="size-4 shrink-0 opacity-70" />
              <h4 class="min-w-0 flex-1 truncate text-sm font-semibold">{KINDS[n.kind].label()}</h4>
              <span class="text-base-content/60 text-xs">{[n.id, ...n.parts].join(" ")}</span>
            </header>
            <div class="flex flex-col gap-2 px-4 py-3 text-sm">
              <p class="text-base-content/80 break-words">{n.parts.join(", ")}</p>
              <table class="w-full text-xs tabular-nums">
                <thead class="text-base-content/60 text-left">
                  <tr>
                    <th class="py-1 pr-2 font-medium">{m.pcb_zephyr_role()}</th>
                    <th class="py-1 pr-2 font-medium">{m.pcb_zephyr_pin()}</th>
                    <th class="py-1 pr-2 font-medium">{m.pcb_zephyr_pad()}</th>
                    <th class="py-1 font-medium">{m.pcb_zephyr_net()}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each n.pins as p (`${p.role}${p.pin}`)}
                    <tr class="border-base-300 border-t align-top">
                      <td class="py-1 pr-2 break-all">{p.role}</td>
                      <td class="py-1 pr-2 whitespace-nowrap">{p.pin}</td>
                      <td class="py-1 pr-2">{p.pad || m.pcb_zephyr_internal()}</td>
                      <td class="py-1 break-all">{p.net || m.pcb_zephyr_internal()}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              {#if n.notes.length > 0}
                <ul class="text-base-content/70 flex list-disc flex-col gap-1 pl-4 text-xs">
                  {#each n.notes as note (note)}
                    <li class="break-words">{note}</li>
                  {/each}
                </ul>
              {/if}
            </div>
          </section>
        {/each}
      </div>
    </aside>
  </div>
</div>
