<script lang="ts">
import { m } from "#lib/paraglide/messages.js"
import { currentLocale } from "#lib/store/locale.ts"
import type { Tensors } from "../../native"

const { tensors }: { tensors: Tensors } = $props()

const compact = (value: number) =>
  new Intl.NumberFormat(currentLocale(), {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)

const counts = $derived(
  tensors.rows === null
    ? [
        m.files_peek_tensors({ count: tensors.total }),
        m.files_peek_parameters({ count: compact(tensors.parameters) }),
      ]
    : [
        m.files_peek_rows({ count: compact(tensors.rows) }),
        m.files_peek_columns({ count: tensors.total }),
      ],
)

const hidden = $derived(tensors.total - tensors.tensors.length)
</script>

<div class="flex size-full min-h-0 flex-col gap-3 p-2 text-xs">
  <div
    class={[
      "flex shrink-0 flex-wrap items-baseline gap-x-2 px-1",
      "text-base-content/55 tabular-nums",
    ]}
  >
    <span class="font-medium text-base-content">{tensors.format}</span>
    {#each counts as count (count)}
      <span class="whitespace-nowrap">{count}</span>
    {/each}
  </div>

  {#if tensors.metadata.length}
    <dl class="flex max-h-32 shrink-0 flex-col gap-0.5 overflow-y-auto px-1">
      {#each tensors.metadata as [key, value], index (index)}
        <div class="flex min-w-0 gap-3">
          <dt class="w-24 shrink-0 truncate text-base-content/55" title={key}>
            {key}
          </dt>
          <dd class="min-w-0 flex-1 truncate" title={value}>{value}</dd>
        </div>
      {/each}
    </dl>
  {/if}

  <ul class="flex min-h-0 grow flex-col gap-0.5 overflow-y-auto">
    {#each tensors.tensors as tensor, index (index)}
      <li class="flex min-w-0 flex-col px-1 py-1">
        <span class="truncate" title={tensor.name}>{tensor.name}</span>
        <span class="truncate text-base-content/55 tabular-nums">
          {tensor.dtype} [{tensor.shape.join(", ")}]
        </span>
      </li>
    {/each}
  </ul>

  {#if hidden > 0}
    <span class="shrink-0 px-1 text-xs text-base-content/55">
      {m.files_peek_more({ count: hidden })}
    </span>
  {/if}
</div>
