import { hostById, hostList, LOCAL } from "#lib/p2p/hosts.svelte.ts"
import type { Page } from "#lib/store/nav.svelte.ts"

const GAPPED: Partial<Record<Page, true>> = {
  chat: true,
  apps: true,
  knowledge: true,
  data: true,
  devices: true,
  calendar: true,
  agent: true,
}

export const gapped = (page: Page) => page in GAPPED

export const localHost = () => hostById(LOCAL)

export const hostViews = () => hostList().map(host => host.view)

export const manyHosts = () => hostList().length > 1
