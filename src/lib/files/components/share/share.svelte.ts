import { listen } from "@tauri-apps/api/event"
import {
  type Member,
  type ShareState,
  shareState,
  takeAttention,
} from "./share"

export const share = $state<{
  state: ShareState
  problem: string | null
  center: boolean
}>({
  state: {
    devices: [],
    browse: { scope: "drives", folders: [], always: [] },
    browseAsks: [],
  },
  problem: null,
  center: false,
})

const refresh = async () => {
  try {
    share.state = await shareState()
    share.problem = null
  } catch (reason) {
    share.problem = String(reason)

    return
  }

  if (await takeAttention()) {
    share.center = true
  }
}

const reloadShare = () => {
  refresh().catch(() => undefined)
}

export const startShare = () => {
  reloadShare()

  const stop = listen("share-changed", reloadShare)

  return () => {
    stop.then(unlisten => unlisten())
  }
}

export const browsable = (): Member[] => share.state.devices

export const memberName = (id: string) =>
  browsable().find(member => member.id === id)?.name ?? id.slice(0, 8)
