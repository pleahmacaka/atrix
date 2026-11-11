<script lang="ts">
import Icon from "@iconify/svelte"
import { m } from "#lib/paraglide/messages.js"
import { type Block, linkTo } from "./doc.ts"

let { block }: { block: Block } = $props()

let copied = $state(false)

const copy = async (text: string) => {
  await navigator.clipboard.writeText(text)
  copied = true
  setTimeout(() => {
    copied = false
  }, 1200)
}
</script>

{#if block.kind === "heading"}
  {@const h = block.heading}
  <svelte:element
    this={h.depth === 2 ? "h2" : "h3"}
    id={h.id}
    class={[
      "group flex scroll-mt-20 items-baseline gap-2 font-semibold @5xl:scroll-mt-8",
      h.depth === 2
        ? "border-base-300 mt-10 border-b pb-2 text-xl first:mt-0"
        : "mt-6 text-base",
    ]}
  >
    <span class="text-base-content/40 tabular-nums">{h.number}.</span>
    <span class="min-w-0">{@html h.html}</span>
    <button
      type="button"
      class={[
        "btn btn-ghost btn-xs btn-square self-center cursor-pointer opacity-0 transition-opacity group-hover:opacity-100",
        copied && "opacity-100",
      ]}
      aria-label={m.pcb_doc_copy_link()}
      title={m.pcb_doc_copy_link()}
      onclick={() => copy(linkTo(h.id))}
    >
      <Icon icon={copied ? "lucide:check" : "lucide:link"} class="size-4" />
    </button>
  </svelte:element>
{:else if block.kind === "code"}
  <div class="border-base-300 bg-base-200 relative rounded-box border">
    <pre class="overflow-x-auto py-3 pr-12 pl-4 text-sm leading-relaxed"><code
        >{block.code}</code
      ></pre>
    <button
      type="button"
      class="btn btn-ghost btn-sm btn-square absolute top-2 right-2"
      aria-label={m.pcb_doc_copy_code()}
      title={m.pcb_doc_copy_code()}
      onclick={() => copy(block.code)}
    >
      <Icon icon={copied ? "lucide:check" : "lucide:copy"} class="size-4" />
    </button>
  </div>
{:else if block.kind === "tree"}
  <div class="prose-doc border-base-300 overflow-x-auto rounded-box border">
    <table>
      <thead>
        <tr>
          <th>{m.pcb_doc_path()}</th>
          <th>{m.pcb_doc_description()}</th>
        </tr>
      </thead>
      <tbody>
        {#each block.rows as [path, text] (path)}
          <tr>
            <td class="whitespace-nowrap">
              <code>{path}</code>
            </td>
            <td>{text}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else if block.kind === "note"}
  <div
    role="note"
    class="border-base-300 bg-base-200 overflow-hidden rounded-box border"
  >
    <div
      class={[
        "border-base-300 flex h-8 items-center gap-2 border-b px-4 text-sm font-semibold",
        block.tone === "warning" ? "bg-warning/15" : "bg-base-300/50",
      ]}
    >
      {#if block.tone === "warning"}
        <Icon icon="lucide:triangle-alert" class="text-warning size-4" />
      {:else}
        <Icon icon="lucide:info" class="size-4" />
      {/if}
      {block.label}
    </div>
    <div class="prose-doc px-4 py-3">{@html block.html}</div>
  </div>
{:else if block.kind === "table"}
  <div class="prose-doc border-base-300 overflow-x-auto rounded-box border">
    {@html block.html}
  </div>
{:else if block.kind === "html"}
  <div class="prose-doc">{@html block.html}</div>
{/if}

<style>
  :global(.prose-doc) {
    line-height: 1.8;
    word-break: keep-all;
    overflow-wrap: break-word;
  }

  :global(.prose-doc > * + *) {
    margin-top: 0.75rem;
  }

  :global(.prose-doc ul) {
    list-style: disc;
    padding-left: 1.25rem;
  }

  :global(.prose-doc ul ul) {
    list-style: circle;
    margin-top: 0.25rem;
  }

  :global(.prose-doc li + li) {
    margin-top: 0.5rem;
  }

  :global(.prose-doc li::marker) {
    color: color-mix(in oklab, var(--color-base-content) 40%, transparent);
  }

  :global(.prose-doc ol) {
    counter-reset: step;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  :global(.prose-doc ol > li) {
    counter-increment: step;
    position: relative;
    padding-left: 2.25rem;
    margin-top: 0;
  }

  :global(.prose-doc ol > li::before) {
    content: counter(step);
    position: absolute;
    left: 0;
    top: 0.25rem;
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    border: var(--border) solid var(--color-base-300);
    background: var(--color-base-200);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  :global(.prose-doc a) {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  :global(.prose-doc strong) {
    font-weight: 600;
  }

  :global(.prose-doc code) {
    background: var(--color-base-200);
    border: var(--border) solid var(--color-base-300);
    border-radius: var(--radius-field);
    padding: 0 0.25rem;
    font-size: 0.875em;
    font-variant-numeric: tabular-nums;
  }

  :global(.prose-doc table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.6;
  }

  :global(.prose-doc th) {
    background: var(--color-base-200);
    font-weight: 600;
    white-space: nowrap;
  }

  :global(.prose-doc th),
  :global(.prose-doc td) {
    padding: 0.5rem 0.75rem;
    text-align: left;
    vertical-align: top;
    min-width: 6rem;
    overflow-wrap: normal;
  }

  :global(.prose-doc tr + tr > *),
  :global(.prose-doc thead + tbody tr > *) {
    border-top: var(--border) solid var(--color-base-300);
  }

  :global(.prose-doc :is(th, td) + :is(th, td)) {
    border-left: var(--border) solid var(--color-base-300);
  }

  :global(.prose-doc img) {
    max-width: 100%;
    height: auto;
    border-radius: var(--radius-box);
  }

  :global(.prose-doc hr) {
    border-color: var(--color-base-300);
  }
</style>
