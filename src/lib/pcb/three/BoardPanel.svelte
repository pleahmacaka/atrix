<script lang="ts">
import type { Snippet } from "svelte"
import { type Outputs, type Status, status } from "../derived.ts"
import { boardQueries } from "./board.svelte.ts"

let {
  outputs,
  placeholder,
}: {
  outputs: Outputs
  placeholder: Snippet<[Status]>
} = $props()

const board = boardQueries(() => outputs)
</script>

{#if board.ready && board.pcb.data && board.urls}
  {#await import("./BoardView.svelte")}
    {@render placeholder("pending")}
  {:then { default: BoardView }}
    <BoardView pcb={board.pcb.data} copper={board.copper.data ?? null} artwork={board.artwork.data ?? null} urls={board.urls} />
  {:catch}
    {@render placeholder("error")}
  {/await}
{:else}
  {@render placeholder(status(board.pcb, board.glbs))}
{/if}
