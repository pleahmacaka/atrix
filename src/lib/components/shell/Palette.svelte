<script lang="ts">
import { tick } from "svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import MenuItem from "#lib/components/ui/MenuItem.svelte"
import MenuLabel from "#lib/components/ui/MenuLabel.svelte"
import { reveal } from "#lib/components/ui/popover.ts"
import SearchField from "#lib/components/ui/SearchField.svelte"
import { hostById, hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { goPage, nav, openConversation, openSettings } from "#lib/store/nav.svelte.ts"
import { APPS_PAGE, PAGES } from "#lib/store/pages.ts"
import { recents } from "#lib/store/recent.ts"
import { settings } from "#lib/store/settings.svelte.ts"
import { keysOf } from "#lib/store/shortcuts.ts"

type Item = {
  key: string
  icon: string
  label: string
  hint?: string
  keys?: string
  running?: boolean
  run: () => unknown
}

type Section = { title: string | null; items: Item[] }

type Drill = { host: string; harness: string; name: string }

const uid = $props.id()

const RECENT_LIMIT = 20

const attempt = new Attempt()

let list = $state<HTMLElement>()

let dialog = $state<HTMLDialogElement>()

let query = $state("")

let drill = $state<Drill | null>(null)

let active = $state(0)

const focusInput = () => dialog?.querySelector("input")?.focus()

$effect(() => {
  if (nav.palette) {
    query = ""
    drill = null
    active = 0
    attempt.failure = null
    dialog?.showModal()
    focusInput()
  } else {
    dialog?.close()
  }
})

const close = () => {
  nav.palette = false
}

const matches = (...texts: string[]) => {
  const q = query.trim().toLowerCase()

  return !q || texts.some(t => t.toLowerCase().includes(q))
}

const enter = (target: Drill) =>
  attempt.run(async () => {
    drill = target
    query = ""
    active = 0
    focusInput()
    await hostById(target.host)?.list(target.harness)
  })

const load = (target: Drill, sessionId: string, cwd: string) =>
  attempt.run(async () => {
    await hostById(target.host)?.load(target.harness, sessionId, cwd)
    openConversation({ kind: "session", host: target.host, id: sessionId })
    close()
  })

const toggleTheme = () => {
  const dark = document.documentElement.dataset.theme === "atrix-dark"

  settings.setTheme(dark ? "light" : "dark")
}

const sections = $derived.by((): Section[] => {
  if (drill) {
    const target = drill
    const listed = hostById(target.host)?.lists[target.harness] ?? []

    return [
      {
        title: null,
        items: listed
          .filter(s => matches(s.title, s.cwd))
          .map(s => ({
            key: s.sessionId,
            icon: "lucide:history",
            label: s.title || m.common_untitled(),
            hint: s.cwd,
            run: () => load(target, s.sessionId, s.cwd),
          })),
      },
    ]
  }

  const actions: Item[] = [
    {
      key: "new",
      icon: "lucide:square-pen",
      label: m.chat_new(),
      keys: keysOf("new"),
      run: () => {
        openConversation(null)
        close()
      },
    },
    {
      key: "theme",
      icon: "lucide:sun-moon",
      label: m.palette_theme(),
      run: () => {
        toggleTheme()
        close()
      },
    },
    {
      key: "settings",
      icon: "lucide:settings",
      label: m.common_settings(),
      keys: keysOf("settings"),
      run: () => openSettings("appearance"),
    },
  ]

  const pages: Item[] = [...PAGES, APPS_PAGE].map(p => ({
    key: `page:${p.id}`,
    icon: p.icon,
    label: p.label(),
    run: () => {
      goPage(p.id)
      close()
    },
  }))

  const recent: Item[] = recents()
    .filter(r => matches(r.title, r.source))
    .slice(0, query.trim() ? undefined : RECENT_LIMIT)
    .map(r => ({
      key: r.key,
      icon: r.icon,
      label: r.title,
      hint: hostList().length > 1 ? r.source : undefined,
      running: r.running,
      run: () => {
        openConversation(r.current)
        close()
      },
    }))

  const harnesses: Item[] = hostList().flatMap(host =>
    (host.view.state?.harnesses ?? [])
      .filter(h => h.enabled && matches(h.name, host.name))
      .map(h => ({
        key: `${host.id}:${h.id}`,
        icon: "lucide:folder-open",
        label: h.name,
        hint: host.name,
        run: () => enter({ host: host.id, harness: h.id, name: h.name }),
      })),
  )

  return [
    { title: null, items: actions.filter(a => matches(a.label)) },
    { title: m.palette_recent(), items: recent },
    { title: m.shell_pages(), items: pages.filter(p => matches(p.label)) },
    { title: m.palette_load(), items: harnesses },
  ].filter(s => s.items.length > 0)
})

const flat = $derived(sections.flatMap(s => s.items))

const move = async (index: number) => {
  active = index

  await tick()

  reveal(document.getElementById(`${uid}-${index}`))
}

const keydown = (e: KeyboardEvent) => {
  if (e.key === "ArrowDown") {
    e.preventDefault()
    move(Math.min(active + 1, flat.length - 1))
  } else if (e.key === "ArrowUp") {
    e.preventDefault()
    move(Math.max(active - 1, 0))
  } else if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault()
    flat[active]?.run()
  } else if (e.key === "Backspace" && !query && drill) {
    drill = null
  }
}
</script>

<dialog bind:this={dialog} class="modal modal-top grid-cols-1" onclose={close}>
  <div
    class={[
      "modal-box popover-box mx-auto mt-20 flex max-h-120 w-full max-w-xl flex-col gap-1 p-1.5",
      "max-sm:mx-4 max-sm:mt-4 max-sm:w-auto max-sm:justify-self-stretch",
    ]}
  >
    <div class="flex shrink-0 items-center gap-1">
      {#if drill}
        <IconButton
          icon="lucide:chevron-left"
          label={m.common_back()}
          class="shrink-0"
          onclick={() => {
            drill = null
            focusInput()
          }}
        />
        <span class="max-w-1/3 shrink-0 truncate text-sm text-base-content/70" title={drill.name}>
          {drill.name}
        </span>
      {/if}
      <SearchField
        bind:value={query}
        placeholder={drill ? m.palette_search_sessions() : m.palette_search()}
        class="h-10 flex-1"
        oninput={() => {
          active = 0
          list?.scrollTo({ top: 0 })
        }}
        onkeydown={keydown}
      />
      {#if attempt.busy}
        <span class="loading loading-spinner loading-xs shrink-0 opacity-60"></span>
      {/if}
    </div>
    <div bind:this={list} class="min-h-0 overflow-y-auto" role="menu">
      {#each sections as section (section.title)}
        {#if section.title}
          <MenuLabel text={section.title} />
        {/if}
        {#each section.items as item (item.key)}
          {@const index = flat.indexOf(item)}
          <MenuItem
            id="{uid}-{index}"
            icon={item.icon}
            label={item.label}
            hint={item.keys}
            selected={index === active}
            class="min-h-9"
            onpointermove={() => {
              active = index
            }}
            onclick={item.run}
          >
            {#snippet trailing()}
              {#if item.running}
                <span class="loading loading-spinner loading-xs shrink-0"></span>
              {/if}
              {#if item.hint}
                <span
                  class="max-w-1/3 min-w-0 truncate text-xs text-base-content/50"
                  title={item.hint}
                >
                  {item.hint}
                </span>
              {/if}
            {/snippet}
          </MenuItem>
        {/each}
      {:else}
        <EmptyState icon="lucide:search-x" text={m.common_no_results()} class="py-6" />
      {/each}
      <ErrorAlert message={attempt.failure} />
    </div>
  </div>
  <form method="dialog" class="modal-backdrop bg-base-100/50 backdrop-blur-sm">
    <button type="submit">{m.common_close()}</button>
  </form>
</dialog>
