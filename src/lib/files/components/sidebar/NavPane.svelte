<script lang="ts">
import { m } from "#lib/paraglide/messages.js"
import { KNOWN_LABELS } from "../../labels"
import {
  deviceLocation,
  HOME,
  RECYCLE_BIN,
  sameLocation,
  THIS_PC,
} from "../../locations"
import type { Drive, KnownId } from "../../native"
import { rootRem, track } from "../../pointer"
import type { Explorer } from "../../store/explorer.svelte"
import { openPlaceMenu, type Place } from "../../store/menus"
import { driveName, places } from "../../store/places.svelte"
import { prefs, type SidebarSection } from "../../store/prefs.svelte"
import {
  movePin,
  orderedPins,
  pathShown,
  sectionShown,
  sidebarIcon,
} from "../../store/sidebar"
import { browsable } from "../share/share.svelte"
import ResizeHandle from "../window/ResizeHandle.svelte"
import NavEntry from "./NavEntry.svelte"

type Entry = Place & {
  label: string
  nested?: boolean
  icon: string
  drive?: Drive
  pin?: number
}

let { explorer }: { explorer: Explorer } = $props()

const ORDER: KnownId[] = [
  "desktop",
  "downloads",
  "documents",
  "pictures",
  "music",
  "videos",
]

const GROUPS: SidebarSection[][] = [
  ["home", "pinned"],
  ["folders"],
  ["drives"],
  ["network"],
  ["linux"],
  ["recycleBin"],
]

const NAV_MIN = 10

const NAV_MAX = 32

const DRAG_SLOP = 6

let pane = $state<HTMLElement>()

let dragging = $state<{ from: number; to: number } | null>(null)

let dragged = false

const location = $derived(explorer.tab.location)

const folders = $derived(
  ORDER.flatMap(id => {
    const known = places.known.find(entry => entry.id === id)

    return known ? [{ id, path: known.path }] : []
  }),
)

const pins = $derived(
  orderedPins(
    places.pinned.filter(
      pin => !folders.some(folder => sameLocation(folder.path, pin.path)),
    ),
  ),
)

const entries: Record<SidebarSection, Entry[]> = $derived({
  home: [
    {
      label: m.files_places_home(),
      location: HOME,
      section: "home",
      hide: "section",
      icon: "lucide:house",
    },
  ],
  pinned: pins.map((pin, index) => ({
    label: pin.name,
    location: pin.path,
    section: "pinned",
    hide: null,
    nested: sectionShown("home"),
    icon: "lucide:folder",
    pin: index,
  })),
  folders: folders
    .filter(folder => pathShown(folder.path))
    .map(folder => ({
      label: KNOWN_LABELS[folder.id](),
      location: folder.path,
      section: "folders",
      hide: "path",
      icon: sidebarIcon(folder.path),
    })),
  drives: [
    {
      label: m.files_places_this_pc(),
      location: THIS_PC,
      section: "drives",
      hide: "section",
      icon: "lucide:monitor",
    },
    ...places.drives
      .filter(drive => pathShown(drive.path))
      .map(drive => ({
        label: driveName(drive),
        location: drive.path,
        section: "drives" as const,
        hide: "path" as const,
        nested: true,
        icon: sidebarIcon(drive.path),
        drive,
      })),
    ...browsable()
      .map(member => ({ ...member, location: deviceLocation(member.id) }))
      .filter(member => pathShown(member.location))
      .map(member => ({
        label: member.name,
        location: member.location,
        section: "drives" as const,
        hide: "path" as const,
        nested: true,
        icon: "lucide:monitor-smartphone",
      })),
  ],
  network: places.network
    .filter(place => pathShown(place.path))
    .map(place => ({
      label: place.name,
      location: place.path,
      section: "network",
      hide: "path",
      icon: "lucide:folder-symlink",
    })),
  linux: places.linux
    .filter(distro => pathShown(distro.path))
    .map(distro => ({
      label: distro.name,
      location: distro.path,
      section: "linux",
      hide: "path",
      icon: "lucide:square-terminal",
    })),
  recycleBin: [
    {
      label: m.files_places_recycle_bin(),
      location: RECYCLE_BIN,
      section: "recycleBin",
      hide: "section",
      icon: "lucide:trash-2",
    },
  ],
})

const groups = $derived(
  GROUPS.map(ids =>
    ids.filter(sectionShown).flatMap(id => entries[id]),
  ).filter(group => group.length),
)

const reorder = (from: number) => (e: PointerEvent) => {
  if (e.button !== 0) {
    return
  }

  const middles = [
    ...(pane?.querySelectorAll<HTMLElement>("[data-pin]") ?? []),
  ].map(row => {
    const box = row.getBoundingClientRect()

    return box.top + box.height / 2
  })

  track(
    e,
    next => {
      if (!dragging && Math.abs(next.clientY - e.clientY) < DRAG_SLOP) {
        return
      }

      const to = middles.findIndex(middle => next.clientY < middle)

      dragging = { from, to: to < 0 ? middles.length : to }
    },
    () => {
      if (dragging) {
        movePin(
          pins.map(pin => pin.path),
          dragging.from,
          dragging.to,
        )
        dragged = true
        setTimeout(() => (dragged = false))
      }

      dragging = null
    },
  )
}

const open = (target: string) => {
  if (!dragged) {
    explorer.go(target)
  }
}

const fit = () => {
  if (!pane) {
    return
  }

  const current = pane.style.width

  pane.style.width = "max-content"

  const natural = pane.getBoundingClientRect().width / rootRem()

  pane.style.width = current
  prefs.navWidth = Math.min(
    NAV_MAX,
    Math.max(NAV_MIN, Math.ceil(natural * 4) / 4 + 0.5),
  )
}
</script>

{#snippet marker(bottom: boolean)}
  <div
    class={[
      "pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-primary",
      bottom ? "-bottom-0.5" : "-top-0.5",
    ]}
  ></div>
{/snippet}

<aside
  bind:this={pane}
  aria-label={m.files_nav_navigation()}
  class="island flex shrink-0 flex-col gap-3 overflow-y-auto p-2"
  style:width="{prefs.navWidth}rem"
  oncontextmenu={e => openPlaceMenu(explorer, e, null)}
>
  {#each groups as group, index (index)}
    <div class="flex flex-col gap-0.5">
      {#each group as entry (`${entry.section}:${entry.location}`)}
        <div
          class={["relative", entry.nested && "ps-4"]}
          data-pin={entry.pin === undefined ? undefined : ""}
        >
          {#if dragging && entry.pin === dragging.to}
            {@render marker(false)}
          {/if}

          <NavEntry
            label={entry.label}
            location={entry.location}
            icon={entry.icon}
            drive={entry.drive}
            active={sameLocation(entry.location, location)}
            dropping={explorer.dropKey !== null &&
              sameLocation(entry.location, explorer.dropKey)}
            onopen={() => open(entry.location)}
            onaux={() => explorer.openInTab(entry.location)}
            onmenu={e => openPlaceMenu(explorer, e, entry)}
            onpress={entry.pin === undefined ? undefined : reorder(entry.pin)}
          />

          {#if dragging?.to === pins.length && entry.pin === pins.length - 1}
            {@render marker(true)}
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</aside>

<ResizeHandle
  label={m.files_nav_navigation()}
  resize={{
    axis: "x",
    min: NAV_MIN,
    max: NAV_MAX,
    get: () => prefs.navWidth,
    set: width => (prefs.navWidth = width),
  }}
  onreset={fit}
/>
