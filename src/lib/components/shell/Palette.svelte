<script lang="ts">
import Icon from "@iconify/svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { hostById, hostList } from "#lib/p2p/hosts.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { nav, openConversation, openSettings } from "#lib/store/nav.svelte.ts"
import { recents } from "#lib/store/recent.ts"

type Item = {
  key: string
  icon: string
  label: string
  hint?: string
  running?: boolean
  run: () => unknown
}

type Section = { title: string | null; items: Item[] }

type Drill = { host: string; harness: string; name: string }

const attempt = new Attempt()

let dialog = $state<HTMLDialogElement>()

let input = $state<HTMLInputElement>()

let query = $state("")

let drill = $state<Drill | null>(null)

let active = $state(0)

$effect(() => {
  if (nav.palette) {
    query = ""
    drill = null
    active = 0
    attempt.failure = null
    dialog?.showModal()
    input?.focus()
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
    input?.focus()
    await hostById(target.host)?.list(target.harness)
  })

const load = (target: Drill, sessionId: string, cwd: string) =>
  attempt.run(async () => {
    await hostById(target.host)?.load(target.harness, sessionId, cwd)
    openConversation({ kind: "session", host: target.host, id: sessionId })
    close()
  })

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
      key: "agent",
      icon: "lucide:bot",
      label: m.shell_page_agent(),
      run: () => {
        nav.page = "agent"
        close()
      },
    },
    {
      key: "new",
      icon: "lucide:plus",
      label: m.chat_new(),
      run: () => {
        openConversation(null)
        close()
      },
    },
    {
      key: "settings",
      icon: "lucide:settings",
      label: m.common_settings(),
      run: () => openSettings("sync"),
    },
  ]

  const recent: Item[] = recents()
    .filter(r => matches(r.title, r.source))
    .map(r => ({
      key: r.key,
      icon: r.icon,
      label: r.title,
      hint: r.source,
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
    { title: m.palette_load(), items: harnesses },
  ].filter(s => s.items.length > 0)
})

const flat = $derived(sections.flatMap(s => s.items))

const keydown = (e: KeyboardEvent) => {
  if (e.key === "ArrowDown") {
    e.preventDefault()
    active = Math.min(active + 1, flat.length - 1)
  } else if (e.key === "ArrowUp") {
    e.preventDefault()
    active = Math.max(active - 1, 0)
  } else if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault()
    flat[active]?.run()
  } else if (e.key === "Backspace" && !query && drill) {
    drill = null
  }
}
</script>

<dialog bind:this={dialog} class="modal modal-top" onclose={close}>
  <div
    class={[
      "modal-box mx-auto mt-20 flex max-h-120 w-full max-w-xl",
      "flex-col gap-0 p-0",
    ]}
  >
    <div class="flex items-center gap-2 border-b border-base-300 px-4">
      {#if drill}
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square"
          aria-label={m.common_back()}
          onclick={() => {
            drill = null
          }}
        >
          <Icon icon="lucide:chevron-left" class="size-4" />
        </button>
        <span class="text-sm whitespace-nowrap text-base-content/70">
          {drill.name}
        </span>
      {:else}
        <Icon icon="lucide:search" class="size-4 text-base-content/50" />
      {/if}
      <input
        bind:this={input}
        class="min-w-0 flex-1 bg-transparent py-4 outline-none"
        placeholder={drill ? m.palette_search_sessions() : m.palette_search()}
        aria-label={m.common_search()}
        bind:value={query}
        oninput={() => {
          active = 0
        }}
        onkeydown={keydown}
      />
      {#if attempt.busy}
        <span class="loading loading-spinner loading-xs opacity-60"></span>
      {/if}
    </div>
    <div class="min-h-0 overflow-y-auto p-2">
      {#each sections as section (section.title)}
        {#if section.title}
          <p class="px-3 pt-3 pb-1 text-xs text-base-content/50">{section.title}</p>
        {/if}
        {#each section.items as item (item.key)}
          {@const index = flat.indexOf(item)}
          <button
            type="button"
            class={[
              "flex w-full cursor-pointer items-center gap-3 rounded-field px-3 py-2",
              "text-left",
              index === active ? "bg-base-content/8" : "",
            ]}
            onmouseenter={() => {
              active = index
            }}
            onclick={item.run}
          >
            <Icon icon={item.icon} class="size-4 shrink-0 text-base-content/60" />
            <span class="min-w-0 flex-1 truncate">{item.label}</span>
            {#if item.running}
              <span class="loading loading-spinner loading-xs"></span>
            {/if}
            {#if item.hint}
              <span class="max-w-48 truncate text-xs text-base-content/50" title={item.hint}>
                {item.hint}
              </span>
            {/if}
          </button>
        {/each}
      {:else}
        <p class="px-3 py-6 text-center text-sm text-base-content/50">{m.common_no_results()}</p>
      {/each}
      <ErrorAlert message={attempt.failure} />
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button type="submit">{m.common_close()}</button>
  </form>
</dialog>
