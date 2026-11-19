<script lang="ts">
import Icon from "@iconify/svelte"
import type { Block, ShownBlock } from "#lib/chat/blocks.ts"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { getLocale } from "#lib/paraglide/runtime.js"
import DataTable from "./DataTable.svelte"
import FileBlock from "./FileBlock.svelte"
import FormBlock from "./FormBlock.svelte"
import { CARD } from "./labels.ts"
import QueryBlock from "./QueryBlock.svelte"

let {
  blocks,
  onAction,
  onSave,
}: {
  blocks: ShownBlock[]
  onAction?: (text: string) => void
  onSave?: (blocks: Block[]) => Promise<unknown>
} = $props()

let saved = $state(false)

const save = async () => {
  if (onSave && !saved) {
    await onSave(blocks.filter((b): b is Block => b.type !== "answers"))
    saved = true
  }
}

const number = new Intl.NumberFormat(getLocale())

const widthOf = (value: number, bars: { value: number }[]) => {
  const top = Math.max(...bars.map(b => Math.abs(b.value)))

  return top > 0 ? (Math.abs(value) / top) * 100 : 0
}

const titleOf = (block: ShownBlock) =>
  "title" in block && typeof block.title === "string" ? block.title : ""
</script>

{#snippet saveButton()}
  <IconButton
    icon={saved ? "lucide:bookmark-check" : "lucide:bookmark-plus"}
    label={saved ? m.apps_saved() : m.apps_save()}
    size="xs"
    class="shrink-0"
    disabled={saved}
    onclick={save}
  />
{/snippet}

{#snippet body(block: ShownBlock)}
  {#if block.type === "card"}
    <p class="text-sm whitespace-pre-line text-base-content/80">{block.body}</p>
  {:else if block.type === "image"}
    <img
      src={block.url}
      alt={block.alt}
      class="max-h-80 w-full rounded-field object-contain"
      loading="lazy"
    />
  {:else if block.type === "keyvalue"}
    <dl class="flex max-h-80 flex-col gap-1 overflow-y-auto text-sm">
      {#each block.items as item, i (i)}
        <div class="flex min-w-0 gap-4">
          <dt
            class="w-1/3 max-w-40 shrink-0 truncate text-base-content/60"
            title={item.key}
          >
            {item.key}
          </dt>
          <dd class="min-w-0 flex-1 break-words tabular-nums">{item.value}</dd>
        </div>
      {/each}
    </dl>
  {:else if block.type === "answers"}
    <dl class="flex max-h-96 flex-col gap-4 overflow-y-auto text-sm">
      {#each block.items as item, i (i)}
        <div class="flex min-w-0 flex-col gap-1">
          <dt class="break-words whitespace-pre-line text-base-content/60">
            {item.question}
          </dt>
          <dd class="break-words whitespace-pre-line">{item.answer}</dd>
        </div>
      {/each}
    </dl>
  {:else if block.type === "table"}
    <DataTable columns={block.columns} rows={block.rows} />
  {:else if block.type === "list"}
    <ul class="max-h-80 list-disc space-y-1 overflow-y-auto ps-5 text-sm">
      {#each block.items as item, i (i)}
        <li>{item}</li>
      {/each}
    </ul>
  {:else if block.type === "bar"}
    <ul class="flex flex-col gap-2 text-sm">
      {#each block.bars as bar, i (i)}
        <li class="flex min-w-0 items-center gap-3">
          <span
            class="w-1/3 max-w-40 shrink-0 truncate text-base-content/70"
            title={bar.label}
          >
            {bar.label}
          </span>
          <span class="h-2 min-w-0 flex-1 rounded-full bg-inset">
            <span
              class={[
                "block h-full rounded-full bg-accent transition-width duration-140",
                "motion-reduce:transition-none",
              ]}
              style:width="{widthOf(bar.value, block.bars)}%"
            ></span>
          </span>
          <span class="shrink-0 tabular-nums">
            {number.format(bar.value)}{block.unit ?? ""}
          </span>
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
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          class="btn btn-sm max-w-full"
          title={link.url}
        >
          <span class="min-w-0 truncate">{link.label}</span>
          <Icon icon="lucide:external-link" class="size-4 shrink-0" />
        </a>
      {/each}
    </div>
  {:else if block.type === "html"}
    <iframe
      title={block.title ?? "html"}
      sandbox="allow-scripts"
      srcdoc={block.html}
      class="h-72 w-full rounded-field border-0 bg-white"
    ></iframe>
  {:else if block.type === "file"}
    <FileBlock path={block.path} title={block.title} />
  {:else if block.type === "scene"}
    {#await import("./SceneBlock.svelte") then { default: SceneBlock }}
      <SceneBlock {block} />
    {/await}
  {/if}
{/snippet}

<div class="flex min-w-0 flex-col gap-3">
  {#each blocks as block, index (index)}
    {@const title = titleOf(block)}
    {@const saving = index === 0 && !!onSave && block.type !== "answers"}
    <section class={CARD}>
      {#if title || saving}
        <div class="mb-2 flex min-w-0 items-start gap-2">
          <h3 class="min-w-0 flex-1 font-semibold break-words">{title}</h3>
          {#if saving}
            {@render saveButton()}
          {/if}
        </div>
      {/if}
      {@render body(block)}
    </section>
  {/each}
</div>
