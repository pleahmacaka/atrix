<script lang="ts">
import Icon from "@iconify/svelte"
import { type Snippet, tick } from "svelte"
import { m } from "#lib/paraglide/messages.js"
import { lcscUrl } from "../bom/bom.ts"
import type { BomLine, Pcb } from "../types.ts"
import DocBlock from "./DocBlock.svelte"
import { boardFacts, keyParts, parseDoc } from "./doc.ts"
import Toc from "./Toc.svelte"

let {
  markdown,
  title,
  pcb,
  bom,
  cover,
  children,
}: {
  markdown: string
  title: string
  pcb: Pcb | null
  bom: BomLine[] | null
  cover: string | null
  children?: Snippet
} = $props()

let coverFailed = $state(false)

let active = $state("")

let scroller = $state<HTMLDivElement>()

let menu = $state<HTMLDetailsElement>()

const parts = $derived(bom ? keyParts(bom) : [])

const doc = $derived(parseDoc(markdown, parts.length > 0))

const facts = $derived(pcb ? boardFacts(pcb) : null)

const current = $derived(
  doc.toc.find(h => h.id === active) ?? doc.toc[0] ?? null,
)

const headingOf = (id: string) =>
  scroller?.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ?? null

const spy = () => {
  if (!scroller) {
    return
  }

  const ids = doc.toc.map(h => h.id)
  const end =
    scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2

  if (end) {
    active = ids.at(-1) ?? ""

    return
  }

  const line =
    scroller.getBoundingClientRect().top + scroller.clientHeight * 0.25

  active =
    ids.findLast(id => (headingOf(id)?.getBoundingClientRect().top ?? 0) <= line) ??
    ids[0] ??
    ""
}

const pick = (id: string) => {
  headingOf(id)?.scrollIntoView({ block: "start" })
  active = id

  if (menu) {
    menu.open = false
  }
}

$effect(() => {
  tick().then(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1))

    if (hash && headingOf(hash)) {
      pick(hash)
    } else {
      spy()
    }
  })
})
</script>

<div bind:this={scroller} onscroll={spy} class="@container scroll-stable size-full overflow-y-auto">
  <details
    bind:this={menu}
    class="dropdown group border-base-300 bg-base-100 sticky top-0 z-10 block w-full border-b @5xl:hidden"
  >
    <summary class="flex h-10 cursor-pointer list-none items-center gap-2 px-4 text-sm">
      <Icon icon="lucide:list" class="size-4 shrink-0 opacity-60" />
      <span class="shrink-0 font-semibold">{m.pcb_doc_on_this_page()}</span>
      {#if current}
        <span class="text-base-content/60 min-w-0 truncate">
          {current.number}. {current.text}
        </span>
      {/if}
      <Icon
        icon="lucide:chevron-down"
        class="ml-auto size-4 shrink-0 opacity-60 transition-transform group-open:rotate-180"
      />
    </summary>
    <div
      class="dropdown-content duration-140 border-base-300 bg-raised max-h-96 w-full overflow-y-auto border-b py-2 shadow-lg"
    >
      <Toc toc={doc.toc} active={current?.id ?? ""} onpick={pick} />
    </div>
  </details>

  <div class="mx-auto flex max-w-6xl justify-center gap-12 px-4 pt-6 pb-24 @2xl:px-8 @2xl:pt-10">
    <article class="flex max-w-3xl min-w-0 flex-1 flex-col gap-4 break-keep">
      <div class="breadcrumbs text-base-content/60 py-0 text-sm">
        <ul>
          <li>PCB Schematic</li>
          <li><span class="max-w-48 truncate">{title}</span></li>
          <li class="text-base-content">{m.pcb_doc_breadcrumb()}</li>
        </ul>
      </div>

      <h1 class="text-3xl font-bold tracking-tight">{title}</h1>

      {@render children?.()}

      {#each doc.blocks as block, i (i)}
        {#if block.kind === "overview"}
          {#each doc.lead as paragraph, j (j)}
            <DocBlock block={{ kind: "html", html: paragraph }} />
          {/each}
          {#if cover && !coverFailed}
            <figure class="flex flex-col gap-2">
              <img
                src={cover}
                onerror={() => (coverFailed = true)}
                alt={m.pcb_doc_top_render({ title })}
                class="border-base-300 bg-inset aspect-video w-full rounded-box border object-contain"
              />
              <figcaption class="text-base-content/60 text-center text-sm">
                {m.pcb_doc_top_render({ title })}
              </figcaption>
            </figure>
          {/if}
        {:else if block.kind === "facts"}
          {#if facts}
            <div class="prose-doc border-base-300 overflow-x-auto rounded-box border">
              <table>
                <tbody>
                  {#each facts as [label, value] (label)}
                    <tr>
                      <th class="w-36">{label}</th>
                      <td>{value}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        {:else if block.kind === "parts"}
          <div class="prose-doc border-base-300 overflow-x-auto rounded-box border">
            <table>
              <thead>
                <tr>
                  <th>{m.pcb_doc_ref()}</th>
                  <th>{m.pcb_doc_parts()}</th>
                  <th>LCSC</th>
                </tr>
              </thead>
              <tbody>
                {#each parts as line (line.refs.join(","))}
                  <tr>
                    <td class="whitespace-nowrap">{line.refs.join(", ")}</td>
                    <td class="min-w-40">{line.mpn || line.value}</td>
                    <td class="whitespace-nowrap">
                      {#if line.lcsc}
                        <a
                          href={lcscUrl(line.lcsc)}
                          target="_blank"
                          rel="noreferrer">{line.lcsc}</a
                        >
                      {:else}
                        <span class="text-base-content/40">{m.pcb_doc_unassigned()}</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <DocBlock {block} />
        {/if}
      {/each}
    </article>

    <aside class="sticky top-10 hidden max-h-svh w-56 shrink-0 self-start overflow-y-auto @5xl:block">
      <p class="text-base-content/60 mb-2 pl-3 text-xs font-semibold">{m.pcb_doc_on_this_page()}</p>
      <Toc toc={doc.toc} active={current?.id ?? ""} onpick={pick} />
    </aside>
  </div>
</div>
