import { type HostEntry, hostList } from "#lib/p2p/hosts.svelte.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { HarnessInfo } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"

type ProfileKey = Pick<HarnessInfo, "base" | "profile">

type Copy = { view: HostView; id: string }

const fanOut = async <T>(
  [first, ...rest]: [Copy, ...Copy[]],
  act: (view: HostView, id: string) => Promise<T>,
) => {
  const result = await act(first.view, first.id)
  const settled = await Promise.allSettled(rest.map(c => act(c.view, c.id)))

  return { result, failed: settled.filter(s => s.status === "rejected").length }
}

export const profileKey = (h: ProfileKey) => `${h.base}\n${h.profile}`

const harnessesOf = (host: HostEntry) => host.view.state?.harnesses ?? []

const profileCopies = (h: ProfileKey): Copy[] =>
  hostList().flatMap(host =>
    harnessesOf(host)
      .filter(x => x.profile && profileKey(x) === profileKey(h))
      .map(x => ({ view: host.view, id: x.id })),
  )

export const copiesOf = (view: HostView, h: HarnessInfo): Copy[] =>
  h.profile ? profileCopies(h) : [{ view, id: h.id }]

export const failedNotice = (failed: number) =>
  failed ? m.harness_copies_failed({ count: failed }) : null

export const onEveryCopy = async (
  copies: Copy[],
  act: (view: HostView, id: string) => Promise<unknown>,
) => {
  const [first, ...rest] = copies

  if (!first) {
    return
  }

  const notice = failedNotice((await fanOut([first, ...rest], act)).failed)

  if (notice) {
    throw new Error(notice)
  }
}

export const removeProfileEverywhere = (h: ProfileKey) =>
  onEveryCopy(profileCopies(h), (view, id) => view.removeProfile(id))

export const createProfileEverywhere = (
  origin: HostView,
  base: string,
  name: string,
  fork: boolean,
) =>
  fanOut(
    [
      { view: origin, id: base },
      ...hostList()
        .filter(
          host =>
            host.view !== origin &&
            harnessesOf(host).some(x => x.id === base && !x.profile),
        )
        .map(host => ({ view: host.view, id: base })),
    ],
    (view, id) => view.createProfile(id, name, fork),
  )
