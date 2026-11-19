<script lang="ts">
import Icon from "@iconify/svelte"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { flip } from "svelte/animate"
import { fade } from "svelte/transition"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { appIcon } from "#lib/desktop/apps.js"
import { relativeTime } from "#lib/desktop/launcher/relative.js"
import { type AppEntry, listApps } from "#lib/desktop/native/apps.js"
import {
  type Notice,
  noticesActivate,
  noticesDismiss,
  noticesList,
  noticesSeen,
  noticesUnseen,
} from "#lib/desktop/native/notices.js"
import {
  hideWindow,
  onWindowHidden,
  onWindowShown,
} from "#lib/desktop/native/windows.js"
import { m } from "#lib/paraglide/messages.js"

const BLUR_GRACE = 400

const MOTION = { duration: 140 }

type Group = { app: string; name: string; path?: string; notices: Notice[] }

const appWindow = getCurrentWindow()

let items = $state.raw<Notice[]>([])

let fresh = $state.raw(new Set<number>())

let apps = $state.raw<AppEntry[]>([])

let icons = $state<Record<string, string>>({})

let now = $state(Date.now())

let loaded = $state(false)

let focusLanded = false

let shownAt = 0

const groups = $derived.by(() => {
  const byApp = new Map<string, Group>()

  for (const notice of items) {
    const group = byApp.get(notice.app)

    if (group) {
      group.notices.push(notice)

      continue
    }

    const id = notice.app.toLowerCase()
    const entry = apps.find(a => a.app_id?.toLowerCase() === id)

    byApp.set(notice.app, {
      app: notice.app,
      name: entry?.name ?? notice.app,
      path: entry?.path,
      notices: [notice],
    })
  }

  return [...byApp.values()]
})

const initial = (name: string) => [...name.trim()][0]?.toUpperCase() ?? "?"

const refresh = async () => {
  const [list, unseen] = await Promise.all([noticesList(), noticesUnseen()]).catch(
    () => [items, 0] as const,
  )
  const newest = list.toSorted((a, b) => b.arrived - a.arrived).slice(0, unseen)

  items = list
  loaded = true
  now = Date.now()

  if (newest.length) {
    fresh = new Set([...fresh, ...newest.map(n => n.id)])
    noticesSeen().catch(() => undefined)
  }
}

const hide = () => {
  focusLanded = false
  hideWindow("notices").catch(() => undefined)
}

const dismiss = async (ids: number[]) => {
  items = items.filter(n => !ids.includes(n.id))
  await noticesDismiss(ids).catch(() => undefined)
}

const activate = async (id: number) => {
  try {
    await noticesActivate(id)
    items = items.filter(n => n.id !== id)
  } catch {
    refresh()
  }
}

$effect(() => {
  for (const group of groups) {
    const path = group.path

    if (path && !icons[path]) {
      appIcon(path)
        .then(icon => {
          if (icon) {
            icons[path] = icon
          }
        })
        .catch(() => undefined)
    }
  }
})

$effect(() => {
  refresh()
  listApps()
    .then(list => {
      apps = list
    })
    .catch(() => undefined)

  const tick = setInterval(() => {
    now = Date.now()
  }, 30_000)

  const stops = [
    listen("notices-changed", refresh),
    onWindowShown("notices", () => {
      focusLanded = false
      shownAt = Date.now()
      refresh()
    }),
    onWindowHidden("notices", () => {
      fresh = new Set()
    }),
    appWindow.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        if (!focusLanded) {
          focusLanded = true
          shownAt = Date.now()
        }

        return
      }

      if (focusLanded && Date.now() - shownAt >= BLUR_GRACE) {
        hide()
      }
    }),
  ]

  return () => {
    clearInterval(tick)

    for (const stop of stops) {
      stop.then(fn => fn()).catch(() => undefined)
    }
  }
})
</script>

<svelte:window
  onkeydown={e => {
    if (e.key === "Escape") {
      hide()
    }
  }}
/>

<main
  class={[
    "m-2 flex min-h-0 flex-1 flex-col gap-2 p-2",
    "rounded-box border border-base-300 bg-base-200 shadow-xl",
  ]}
>
  <header
    class={[
      "flex h-10 shrink-0 items-center gap-1 ps-3 pe-1.5",
      "rounded-box border border-base-300 bg-base-100",
    ]}
  >
    <h1 class="min-w-0 flex-1 truncate text-sm font-semibold">{m.notices_title()}</h1>
    {#if items.length > 0}
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        onclick={() => dismiss(items.map(n => n.id))}
      >
        <Icon icon="lucide:check-check" class="size-4" />
        {m.notices_clear_all()}
      </button>
    {/if}
    <IconButton icon="lucide:x" label={m.common_close()} onclick={hide} />
  </header>

  <div class="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
    {#if loaded && items.length === 0}
      <EmptyState
        icon="lucide:bell-off"
        text={m.notices_empty()}
        centered
        class="absolute inset-0"
      />
    {/if}
    {#each groups as group (group.app)}
      <section
        class="shrink-0 rounded-box border border-base-300 bg-base-100 p-1.5"
        animate:flip={{ duration: 160 }}
        transition:fade={MOTION}
      >
        <header class="group/app flex min-h-8 items-center gap-2 pl-2">
          {#if group.path && icons[group.path]}
            <img src={icons[group.path]} alt="" class="size-5 shrink-0 object-contain" />
          {:else}
            <span
              class={[
                "grid size-5 shrink-0 place-items-center rounded-field",
                "bg-base-content/8 text-xs font-semibold text-base-content/70",
              ]}
              aria-hidden="true"
            >
              {initial(group.name)}
            </span>
          {/if}
          <h2
            class="min-w-0 flex-1 truncate text-xs font-medium text-base-content/60"
            title={group.name}
          >
            {group.name}
          </h2>
          <IconButton
            icon="lucide:trash-2"
            label={m.notices_dismiss_app({ app: group.name })}
            size="xs"
            class="opacity-0 group-hover/app:opacity-100 focus-visible:opacity-100"
            onclick={() => dismiss(group.notices.map(n => n.id))}
          />
        </header>

        {#each group.notices as notice (notice.id)}
          <div
            class="group relative flex items-start gap-1 rounded-field hover:bg-base-content/8"
            animate:flip={{ duration: 160 }}
            transition:fade={MOTION}
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 px-2 py-2 text-left"
              onclick={() => activate(notice.id)}
            >
              <span class="flex min-w-0 items-center gap-2">
                <span class="min-w-0 flex-1 truncate text-sm font-medium" title={notice.title}>
                  {notice.title}
                </span>
                {#if fresh.has(notice.id)}
                  <span
                    class="size-2 shrink-0 rounded-full bg-primary"
                    role="img"
                    aria-label={m.notices_unseen()}
                  ></span>
                {/if}
                <span class="shrink-0 whitespace-nowrap text-xs tabular-nums text-base-content/50">
                  {relativeTime(notice.arrived, now)}
                </span>
              </span>
              {#if notice.body}
                <span class="line-clamp-3 text-xs text-base-content/60">{notice.body}</span>
              {/if}
            </button>
            <IconButton
              icon="lucide:x"
              label={m.notices_dismiss()}
              size="xs"
              class={[
                "mt-1.5 mr-1 shrink-0 opacity-0",
                "group-hover:opacity-100 focus-visible:opacity-100",
              ]}
              onclick={() => dismiss([notice.id])}
            />
          </div>
        {/each}
      </section>
    {/each}
  </div>
</main>
