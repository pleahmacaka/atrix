<script lang="ts">
import Icon from "@iconify/svelte"
import { tick } from "svelte"
import { toast } from "#lib/files/store/toast.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu } from "#lib/store/contextMenu.svelte.ts"
import {
  isUnc,
  isVirtual,
  parentOf,
  remoteName,
  sameLocation,
  segments,
  splitDevice,
  THIS_PC,
} from "../../locations"
import { openItem, runAddress } from "../../native"
import { parseRemote } from "../../remote"
import { splitArchive } from "../../store/archive.svelte"
import { cloneInto } from "../../store/clone"
import type { Explorer } from "../../store/explorer.svelte"
import { driveName, NAMED_PLACES, places } from "../../store/places.svelte"
import { prefetchOnHover } from "../../store/prefetch"
import { confirmPrivate } from "../../store/privacy.svelte"
import { memberName } from "../share/share.svelte"

let { explorer }: { explorer: Explorer } = $props()

const OVERFLOW_WIDTH = 32

const EDIT_ROOM = 40

let editing = $state(false)

let cloning = $state(false)

let draft = $state("")

let field = $state<HTMLInputElement>()

let barWidth = $state(0)

let widths = $state<number[]>([])

const tab = $derived(explorer.tab)

const named = $derived(
  NAMED_PLACES.map(([path, label]) => ({ name: label(), path })),
)

const thisPc = $derived(named.find(entry => entry.path === THIS_PC))

const deviceCrumbs = (location: string) => {
  const chain: { name: string; path: string }[] = []
  let at: string | null = location
  let device = splitDevice(location)

  while (at && device) {
    chain.unshift({
      name:
        device.path === null ? memberName(device.id) : remoteName(device.path),
      path: at,
    })
    at = parentOf(at)
    device = at ? splitDevice(at) : null
  }

  return thisPc ? [thisPc, ...chain] : chain
}

const crumbs = $derived.by(() => {
  const location = tab.location
  const known = named.find(entry => entry.path === location)

  if (known) {
    return [known]
  }

  if (splitDevice(location)) {
    return deviceCrumbs(location)
  }

  if (isVirtual(location)) {
    return [{ name: tab.shellName || location, path: location }]
  }

  const parts = segments(location).map((part, index) => {
    const drive =
      index === 0
        ? places.drives.find(drive => sameLocation(drive.path, part.path))
        : undefined

    return drive ? { name: driveName(drive), path: part.path } : part
  })

  return isUnc(location) || !thisPc ? parts : [thisPc, ...parts]
})

const hidden = $derived.by(() => {
  const room = barWidth - EDIT_ROOM

  if (
    widths.length !== crumbs.length ||
    widths.reduce((a, b) => a + b, 0) <= room
  ) {
    return 0
  }

  let used = OVERFLOW_WIDTH
  let shown = 0

  for (let index = crumbs.length - 1; index >= 0; index--) {
    if (shown > 0 && used + widths[index] > room) {
      break
    }

    used += widths[index]
    shown++
  }

  return crumbs.length - shown
})

const showHidden = (e: MouseEvent & { currentTarget: HTMLElement }) => {
  const box = e.currentTarget.getBoundingClientRect()
  const at = new MouseEvent("contextmenu", {
    clientX: box.left,
    clientY: box.bottom + 4,
  })

  contextMenu.show(
    at,
    crumbs
      .slice(0, hidden)
      .reverse()
      .map(crumb => ({
        label: crumb.name,
        icon: "lucide:folder",
        run: () => explorer.go(crumb.path),
      })),
  )
}

const measure = (node: HTMLElement) => {
  const update = () => {
    widths = [...node.children].map(
      child => child.getBoundingClientRect().width,
    )
  }

  const observer = new ResizeObserver(update)

  observer.observe(node)
  update()

  return () => observer.disconnect()
}

export const edit = async () => {
  draft = isVirtual(tab.location) ? (crumbs.at(-1)?.name ?? "") : tab.location
  editing = true

  await tick()
  field?.focus()
  field?.select()
}

const remote = $derived(editing ? parseRemote(draft) : null)

const submit = async () => {
  const text = draft.trim()

  editing = false

  if (!text || text === crumbs.at(-1)?.name) {
    return
  }

  const repository = parseRemote(text)

  if (repository) {
    cloning = true
    await cloneInto(tab, repository)
    cloning = false

    return
  }

  const alias = named.find(
    entry => entry.name.toLowerCase() === text.toLowerCase(),
  )

  if (alias) {
    return explorer.go(alias.path)
  }

  const cwd = isVirtual(tab.location) ? null : tab.location
  const found = await runAddress(text, cwd).catch(() => undefined)
  const target = found?.select ?? text

  if (splitArchive(target)) {
    return explorer.go(target)
  }

  if (found === undefined) {
    return toast(m.files_errors_missing(), "error")
  }

  if (!found) {
    return
  }

  if (found.file && found.select) {
    if (!(await confirmPrivate(found.select))) {
      return
    }

    return openItem(found.select).catch(() =>
      toast(m.files_errors_missing(), "error"),
    )
  }

  explorer.go(found.path)
}
</script>

<div
  bind:clientWidth={barWidth}
  class={[
    "relative isolate flex h-9 min-w-0 flex-1 items-center overflow-hidden",
    "rounded-field bg-base-content/5 text-sm",
  ]}
  aria-busy={tab.loading || tab.searching}
>
  {#if tab.loading || tab.searching}
    <span
      class={[
        "pointer-events-none absolute inset-0 -z-10",
        "transition-opacity delay-200 duration-140 starting:opacity-0",
      ]}
    >
      <span
        class={[
          "block h-full w-23/25 bg-primary/12",
          "transition-width delay-200 duration-12000 ease-standard starting:w-0",
        ]}
      ></span>
    </span>
  {/if}

  {#if cloning}
    <span
      class="loading loading-spinner loading-xs ms-3 shrink-0 text-primary"
    ></span>
  {/if}

  {#if editing}
    {#if remote}
      <Icon
        icon={remote.icon}
        class="ms-3 size-4 shrink-0"
        aria-label={remote.label}
      />
    {/if}

    <input
      bind:this={field}
      bind:value={draft}
      aria-label={m.files_nav_address()}
      spellcheck="false"
      autocomplete="off"
      class="h-full min-w-0 flex-1 bg-transparent px-3 outline-none select-text"
      onblur={() => (editing = false)}
      onkeydown={e => {
        if (e.key === "Enter") {
          e.preventDefault()
          submit()
        } else if (e.key === "Escape") {
          editing = false
        }
      }}
    />

    {#if remote}
      <span
        class="me-3 flex shrink-0 items-center gap-1 text-xs text-base-content/55"
      >
        <Icon icon="lucide:corner-down-left" class="size-3" />
        {m.files_git_clone_here()}
      </span>
    {/if}
  {:else}
    <div
      aria-hidden="true"
      class="invisible absolute flex items-center whitespace-nowrap ps-1"
      {@attach measure}
    >
      {#each crumbs as crumb, index (crumb.path)}
        <span class="flex shrink-0 items-center">
          {#if index > 0}
            <Icon icon="lucide:chevron-right" class="size-3.5" />
          {/if}
          <span
            class={[
              "truncate px-2 py-1",
              index === crumbs.length - 1 && "max-w-80",
            ]}
          >
            {crumb.name}
          </span>
        </span>
      {/each}
    </div>

    <nav
      aria-label={m.files_nav_address()}
      class="flex min-w-0 items-center overflow-hidden ps-1"
    >
      {#if hidden > 0}
        <button
          type="button"
          class={[
            "grid size-7 shrink-0 cursor-pointer place-items-center rounded-field",
            "text-base-content/60 transition-colors duration-140",
            "hover:bg-base-content/8 hover:text-base-content",
          ]}
          aria-label={m.files_nav_hidden_path()}
          title={m.files_nav_hidden_path()}
          onclick={showHidden}
        >
          <Icon icon="lucide:chevrons-left" class="size-4" />
        </button>
      {/if}

      {#each crumbs.slice(hidden) as crumb, index (crumb.path)}
        {@const last = index === crumbs.length - hidden - 1}
        {#if index > 0 || hidden > 0}
          <Icon
            icon="lucide:chevron-right"
            class="size-3.5 shrink-0 text-base-content/35"
          />
        {/if}
        <button
          type="button"
          class={[
            "h-7 cursor-pointer truncate rounded-field px-2",
            "transition-colors duration-140 hover:bg-base-content/8",
            last
              ? "max-w-80 min-w-0 shrink font-medium"
              : "shrink-0 text-base-content/70",
          ]}
          title={crumb.name}
          onclick={() => explorer.go(crumb.path)}
          {@attach prefetchOnHover(crumb.path)}
        >
          {crumb.name}
        </button>
      {/each}
    </nav>

    <button
      type="button"
      class="h-full min-w-8 flex-1 cursor-text"
      aria-label={m.files_nav_address()}
      onclick={edit}
    ></button>
  {/if}
</div>
