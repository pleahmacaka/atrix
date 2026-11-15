<script lang="ts">
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import { GRAPH, knowledgeHost } from "#lib/knowledge/host.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav } from "#lib/store/nav.svelte.ts"
import CanvasView from "./CanvasView.svelte"
import GraphView from "./GraphView.svelte"
import KnowledgeDoc from "./KnowledgeDoc.svelte"

const host = $derived(knowledgeHost())

const empty = $derived(
  !!host?.state?.knowledge?.ready &&
    host.knowledge.length === 0 &&
    host.canvases.length === 0,
)
</script>

{#if host && nav.doc === GRAPH}
  <GraphView {host} />
{:else if host && nav.doc?.endsWith(".canvas")}
  {#key nav.doc}
    <CanvasView {host} path={nav.doc} />
  {/key}
{:else if host && nav.doc}
  {#key nav.doc}
    <KnowledgeDoc {host} id={nav.doc} />
  {/key}
{:else if empty}
  <EmptyState
    icon="lucide:library"
    title={m.knowledge_empty()}
    text={m.knowledge_empty_hint()}
    centered
  />
{:else}
  <EmptyState icon="lucide:library" text={m.knowledge_select()} centered />
{/if}
