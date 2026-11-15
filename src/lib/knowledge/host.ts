import { hostList } from "#lib/p2p/hosts.svelte.ts"

export const knowledgeHost = () => {
  const hosts = hostList()

  return (
    hosts.find(h => h.view.state?.knowledge.ready)?.view ??
    hosts[0]?.view ??
    null
  )
}

export const GRAPH = "graph"
