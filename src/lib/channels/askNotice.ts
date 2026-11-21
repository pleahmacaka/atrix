import { logFailure } from "#lib/logging.ts"
import type { Ask } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import {
  channelOfSession,
  channels,
  connected,
  sendToChannel,
} from "./store.svelte.ts"

export const announceAsk = (sessionId: string, title: string, ask: Ask) => {
  const own = channelOfSession(sessionId)
  const targets = own
    ? [own.channel]
    : channels.bots.flatMap(b =>
        connected(b.provider) ? b.channels.slice(0, 1) : [],
      )
  const text = m.channel_ask_notice({
    session: title || sessionId,
    ask: ask.title,
  })

  for (const channel of targets) {
    sendToChannel(channel, text).catch((e: unknown) =>
      logFailure("channel ask notice", e),
    )
  }
}
