import { hostList } from "#lib/p2p/hosts.svelte.ts"

export const knowledgeHost = () =>
  hostList().find(h => h.view.state?.knowledge.ready)?.view ??
  hostList()[0]?.view ??
  null

export const GRAPH = "graph"
