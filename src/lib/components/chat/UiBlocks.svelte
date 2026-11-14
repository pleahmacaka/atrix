<script lang="ts">
import Icon from "@iconify/svelte"
import type { Block } from "#lib/chat/blocks.ts"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import FormBlock from "./FormBlock.svelte"
import QueryBlock from "./QueryBlock.svelte"

let {
  blocks,
  onAction,
  onSave,
}: {
  blocks: Block[]
  onAction?: (text: string) => void
  onSave?: (blocks: Block[]) => Promise<unknown>
} = $props()

let saved = $state(false)

const save = async () => {
  if (onSave && !saved) {
    await onSave(blocks)
    saved = true
  }
}

const number = new Intl.NumberFormat(getLocale())

const widthOf = (value: number, bars: { value: number }[]) => {
  const top = Math.max(...bars.map(b => Math.abs(b.value)))

  return top > 0 ? (Math.abs(value) / top) * 100 : 0
}
</script>

{#snippet body(block: Block)}
        {#if block.type === "keyvalue"}
          <dl class="flex max-h-80 flex-col gap-1 overflow-y-auto text-sm">
            {#each block.items as item, i (i)}
              <div class="flex gap-4">
                <dt class="w-28 shrink-0 text-base-content/60">{item.key}</dt>
                <dd class="min-w-0 flex-1 tabular-nums">{item.value}</dd>
              </div>
            {/each}
          </dl>
        {:else if block.type === "table"}
          <div class="max-h-96 overflow-auto">
            <table class="table table-sm tabular-nums">
              <thead>
                <tr>
                  {#each block.columns as column, i (i)}
                    <th>{column}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each block.rows as row, r (r)}
                  <tr>
                    {#each block.columns as _, c (c)}
                      <td>{row[c] ?? ""}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else if block.type === "list"}
          <ul class="max-h-80 list-disc space-y-1 overflow-y-auto ps-5 text-sm">
            {#each block.items as item, i (i)}
              <li>{item}</li>
            {/each}
          </ul>
        {:else if block.type === "bar"}
          <ul class="flex flex-col gap-2 text-sm">
            {#each block.bars as bar, i (i)}
              <li class="flex items-center gap-3">
                <span class="w-28 shrink-0 truncate text-base-content/70">{bar.label}</span>
                <span class="h-2 flex-1 rounded-full bg-base-200">
                  <span
                    class="block h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
                    style:width="{widthOf(bar.value, block.bars)}%"
                  ></span>
                </span>
                <span class="tabular-nums">{number.format(bar.value)}{block.unit ?? ""}</span>
              </li>
            {/each}
          </ul>
        {:else if block.type === "actions"}
          <div class="flex flex-wrap gap-2">
            {#each block.buttons as button, i (i)}
              <button
                type="button"
                class="btn btn-sm"
                disabled={!onAction}
                onclick={() => onAction?.(button.reply)}
              >
                {button.label}
              </button>
            {/each}
          </div>
        {:else if block.type === "form"}
          <FormBlock {block} {onAction} />
        {:else if block.type === "query"}
          <QueryBlock {block} />
        {:else if block.type === "links"}
          <div class="flex flex-wrap gap-2">
            {#each block.links as link, i (i)}
              <a href={link.url} target="_blank" rel="noreferrer" class="btn btn-sm">
                {link.label}
                <Icon icon="lucide:external-link" class="size-4" />
              </a>
            {/each}
          </div>
        {:else if block.type === "scene"}
          {#await import("./SceneBlock.svelte") then { default: SceneBlock }}
            <SceneBlock {block} />
          {/await}
        {/if}
{/snippet}

<div class="relative flex flex-col gap-3">
  {#if onSave}
    <button
      type="button"
      class="btn btn-ghost btn-xs btn-square absolute top-2 right-2 z-10"
      aria-label={saved ? m.apps_saved() : m.apps_save()}
      title={saved ? m.apps_saved() : m.apps_save()}
      disabled={saved}
      onclick={save}
    >
      <Icon
        icon={saved ? "lucide:bookmark-check" : "lucide:bookmark-plus"}
        class="size-4"
      />
    </button>
  {/if}
  {#each blocks as block, index (index)}
    <section class="min-w-0 rounded-box border border-base-300 bg-raised p-4">
      {#if block.type === "card"}
        <h3 class="font-semibold">{block.title}</h3>
        <p class="mt-1 text-sm whitespace-pre-line text-base-content/80">{block.body}</p>
      {:else if block.type === "image"}
        <img src={block.url} alt={block.alt} class="max-h-80 w-full rounded-field object-contain" loading="lazy" />
      {:else}
        {#if block.title}
          <h3 class="mb-2 font-semibold">{block.title}</h3>
        {/if}
        {@render body(block)}
      {/if}
    </section>
  {/each}
</div>
