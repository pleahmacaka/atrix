<script lang="ts">
  import type { ClassValue } from "svelte/elements"

  let {
    compact,
    preview,
    class: extra,
  }: { compact: boolean; preview: boolean; class?: ClassValue } = $props()

  const ROWS = [72, 54, 64, 46, 58]

  const TILES = Array.from({ length: 12 }, (_, index) => index)

  const SELECTED = 1
</script>

<div
  aria-hidden="true"
  class={[
    "flex aspect-16/10 flex-col gap-1 overflow-hidden p-1",
    "rounded-box border border-base-300 bg-base-200",
    extra,
  ]}
>
  <div class="flex h-1/12 shrink-0 items-center gap-1 px-0.5">
    <span class="h-4/5 w-1/5 rounded-sm bg-base-100"></span>
    <span class="h-3/5 w-1/6 rounded-sm bg-base-content/8"></span>
    <span class="grow"></span>
    <span class="size-1.5 rounded-full bg-base-content/25"></span>
    <span class="size-1.5 rounded-full bg-base-content/25"></span>
    <span class="size-1.5 rounded-full bg-base-content/25"></span>
  </div>

  <div class="flex h-1/12 shrink-0 items-center gap-1 px-0.5">
    <span class="size-2 rounded-sm bg-base-content/25"></span>
    <span class="size-2 rounded-sm bg-base-content/25"></span>
    <span class="h-4/5 grow rounded-sm bg-base-100"></span>
    <span class="h-4/5 w-1/5 rounded-sm bg-base-100"></span>

    {#if compact}
      <span class="size-2 rounded-sm bg-primary/70"></span>
      <span class="size-2 rounded-sm bg-base-content/25"></span>
    {/if}
  </div>

  {#if !compact}
    <div class="flex h-1/12 shrink-0 items-center gap-1.5 px-0.5">
      {#each [0, 1, 2, 3, 4] as index (index)}
        <span class="size-2 rounded-sm bg-base-content/20"></span>
      {/each}
      <span class="grow"></span>
      <span class="size-2 rounded-sm bg-primary/70"></span>
      <span class="size-2 rounded-sm bg-base-content/20"></span>
    </div>
  {/if}

  <div class="flex min-h-0 grow gap-1">
    <div
      class={[
        "flex w-1/4 shrink-0 flex-col gap-1 p-1",
        "rounded-sm border border-base-300 bg-base-100",
      ]}
    >
      <span class="flex h-2.5 shrink-0 items-center rounded-sm bg-primary/8 px-1">
        <span class="h-1 w-3/5 rounded-full bg-primary/70"></span>
      </span>

      {#each ROWS as width, index (index)}
        <span class="flex h-2.5 shrink-0 items-center px-1">
          <span
            class="h-1 rounded-full bg-base-content/15"
            style:width="{width}%"
          ></span>
        </span>
      {/each}
    </div>

    <div
      class={[
        "grid min-w-0 grow grid-cols-4 content-start gap-1 p-1",
        "rounded-sm border border-base-300 bg-base-100",
      ]}
    >
      {#each TILES as index (index)}
        {@const selected = index === SELECTED}

        <div
          class={[
            "flex flex-col items-center gap-1 rounded-sm p-1",
            selected && "bg-primary/8",
          ]}
        >
          <span
            class={[
              "aspect-square w-3/5 rounded-sm",
              selected ? "bg-primary/60" : "bg-base-content/15",
            ]}
          ></span>
          <span
            class={[
              "h-1 w-4/5 rounded-full",
              selected ? "bg-primary/50" : "bg-base-content/10",
            ]}
          ></span>
        </div>
      {/each}
    </div>

    {#if preview}
      <div
        class={[
          "flex w-1/4 shrink-0 flex-col gap-1.5 p-1.5",
          "rounded-sm border border-base-300 bg-base-100",
        ]}
      >
        <span class="aspect-square w-full rounded-sm bg-primary/15"></span>
        <span class="h-1 w-4/5 rounded-full bg-base-content/20"></span>
        <span class="h-1 w-3/5 rounded-full bg-base-content/10"></span>
      </div>
    {/if}
  </div>
</div>
