import { Effect } from "effect"
import { m } from "#lib/paraglide/messages.js"
import { DRIVE_LABELS } from "../labels"
import {
  HOME,
  isDriveRoot,
  RECYCLE_BIN,
  sameLocation,
  THIS_PC,
  WINDOWS,
} from "../locations"
import {
  type Distro,
  type Drive,
  drives,
  type Known,
  knownFolders,
  listShell,
  type NetworkPlace,
  networkPlaces,
  type ShellEntry,
  wslDistros,
} from "../native"
import { prefs } from "./prefs.svelte"

export const places = $state<{
  known: Known[]
  drives: Drive[]
  pinned: ShellEntry[]
  network: NetworkPlace[]
  linux: Distro[]
}>({ known: [], drives: [], pinned: [], network: [], linux: [] })

const shareName = (remote: string) => {
  const parts = remote.split("\\").filter(Boolean)

  return parts.length > 1
    ? `${parts.at(-1)} (\\\\${parts.slice(0, -1).join("\\")})`
    : remote
}

const systemLabel = (drive: Drive) =>
  (drive.remote && shareName(drive.remote)) ||
  drive.label ||
  DRIVE_LABELS[drive.kind]()

export const driveLabel = (drive: Drive) =>
  prefs.driveNames[drive.path] || systemLabel(drive)

export const driveName = (drive: Drive) =>
  `${driveLabel(drive)} (${WINDOWS ? drive.path.slice(0, 2) : drive.path})`

export const nameDrive = (drive: Drive, name: string) => {
  const alias = name.trim()
  const others = Object.entries(prefs.driveNames).filter(
    ([path]) => path !== drive.path,
  )
  const custom = alias && alias !== systemLabel(drive)

  prefs.driveNames = Object.fromEntries(
    custom ? [...others, [drive.path, alias]] : others,
  )
}

export const NAMED_PLACES: [string, () => string][] = [
  [HOME, m.files_places_home],
  [THIS_PC, m.files_places_this_pc],
  [RECYCLE_BIN, m.files_places_recycle_bin],
]

export const placeName = (location: string) => {
  const named = NAMED_PLACES.find(([path]) => path === location)

  if (named) {
    return named[1]()
  }

  const drive = isDriveRoot(location)
    ? places.drives.find(entry => sameLocation(entry.path, location))
    : undefined

  return drive ? driveName(drive) : null
}

const PLACE_WAIT = "3 seconds"

const source = <T>(load: () => Promise<T>, apply: (found: T) => void) =>
  Effect.tryPromise(load).pipe(
    Effect.timeout(PLACE_WAIT),
    Effect.tap(found => Effect.sync(() => apply(found))),
    Effect.ignore,
  )

export const refreshPlaces = () =>
  Effect.runPromise(
    Effect.all(
      [
        source(knownFolders, found => {
          places.known = found
        }),
        source(drives, found => {
          places.drives = found
        }),
        source(
          () => listShell(HOME),
          quick => {
            places.pinned = quick.entries.filter(entry => entry.dir)
          },
        ),
        source(networkPlaces, found => {
          places.network = found
        }),
        source(wslDistros, found => {
          places.linux = found
        }),
      ],
      { concurrency: "unbounded", discard: true },
    ),
  )
