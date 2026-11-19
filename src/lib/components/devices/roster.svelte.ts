import { listen } from "@tauri-apps/api/event"
import { SvelteMap } from "svelte/reactivity"
import { native } from "#lib/native.ts"
import {
  type NetEvent,
  type Pairing,
  type Peer,
  transport,
} from "#lib/p2p/net.ts"
import { PAIR_MINUTES } from "#lib/p2p/sync.svelte.ts"
import { desktop, platform } from "#lib/platform.ts"
import { settings } from "#lib/store/settings.svelte.ts"

export type PairSource = {
  peers: ReadonlyMap<string, Peer>
  pairing: Pairing | null
  issue: () => Promise<void>
  closePairing: () => Promise<void>
  connect: (code: string) => Promise<void>
  unpair: (id: string) => Promise<void>
}

type RosterEvent = Extract<NetEvent, { type: "peers" | "paired" }>

class Roster implements PairSource {
  peers = new SvelteMap<string, Peer>()

  pairing = $state<Pairing | null>(null)

  started = $state(false)

  watch = () => {
    const stop = listen<RosterEvent>("net-roster", ({ payload }) => {
      if (payload.type === "peers") {
        this.#take(payload.peers)
      } else {
        this.pairing = null
      }
    })

    stop
      .then(() => native<Peer[] | null>("net_roster"))
      .then(peers => peers && this.#take(peers))
      .catch(() => {})

    return () => {
      stop.then(unlisten => unlisten())
    }
  }

  issue = async () => {
    this.pairing = await transport.issue(PAIR_MINUTES)
  }

  closePairing = async () => {
    this.pairing = null
    await transport.cancel().catch(() => {})
  }

  connect = async (code: string) => {
    await transport.join(code.trim())
  }

  unpair = (id: string) => transport.unpair(id)

  rename = (name: string) => {
    settings.setName(name)
    transport
      .info({ name: settings.deviceName, platform, host: desktop })
      .catch(() => {})
  }

  #take = (peers: Peer[]) => {
    this.started = true
    this.peers.clear()

    for (const peer of peers) {
      if (!peer.removed) {
        this.peers.set(peer.id, peer)
      }
    }
  }
}

export const roster = new Roster()
