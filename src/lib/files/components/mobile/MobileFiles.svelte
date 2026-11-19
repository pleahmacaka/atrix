<script lang="ts">
  import Icon from "@iconify/svelte"
  import type { Snippet } from "svelte"
  import ConfirmDialog from "#lib/components/ui/ConfirmDialog.svelte"
  import EmptyState from "#lib/components/ui/EmptyState.svelte"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import Modal from "#lib/components/ui/Modal.svelte"
  import SearchField from "#lib/components/ui/SearchField.svelte"
  import { toast } from "#lib/files/store/toast.svelte.ts"
  import { m } from "#lib/paraglide/messages.js"
  import { currentLocale } from "#lib/store/locale.ts"
  import { formatBytes } from "../../format"
  import { randomToken, usageForget, usageScan } from "../../native"
  import MobileThumb from "./MobileThumb.svelte"
  import {
    CATEGORIES,
    deleteItems,
    type Entry,
    type Folder,
    iconOf,
    isMedia,
    listFolder,
    newFolder,
    openFile,
    openWith,
    pasteItems,
    renameItem,
    requestStorage,
    type Sort,
    type SortKey,
    scanFiles,
    setClipboard,
    shareFiles,
    sortEntries,
    storageStats,
  } from "./mobile"

  type Problem = "permission" | "failed"

  type Prompt = { kind: "newFolder" | "rename"; value: string; target: string }

  type Action = {
    icon: string
    label: () => string
    run: () => unknown
    single?: boolean
    files?: boolean
  }

  let { actions }: { actions?: Snippet } = $props()

  const SORT_KEY = "atrix-files-mobile-sort"
  const HIDDEN_KEY = "atrix-files-mobile-hidden"
  const HOLD_MS = 420
  const SLOP = 10
  const EDGE = 64
  const STEP = 14

  const SORTS: { key: SortKey; label: () => string }[] = [
    { key: "name", label: m.files_mobile_sort_name },
    { key: "modified", label: m.files_mobile_sort_modified },
    { key: "size", label: m.files_mobile_sort_size },
  ]

  const ERRORS: Record<string, () => string> = {
    busy: m.files_mobile_errors_busy,
    denied: m.files_mobile_errors_denied,
    missing: m.files_mobile_errors_missing,
    noApp: m.files_mobile_errors_no_app,
    unsupported: m.files_mobile_errors_unsupported,
    invalid: m.files_mobile_errors_invalid,
    full: m.files_mobile_errors_full,
  }

  const savedSort = (): Sort => {
    try {
      return JSON.parse(localStorage.getItem(SORT_KEY) ?? "") as Sort
    } catch {
      return { key: "name", descending: false }
    }
  }

  let home = $state(true)
  let path = $state<string | null>(null)
  let start = $state<Folder | null>(null)
  let stats = $state<Record<string, { total: number; free: number }>>({})
  let folder = $state<Folder | null>(null)
  let problem = $state<Problem | null>(null)
  let loading = $state(false)
  let reload = $state(0)
  let selected = $state<Set<string>>(new Set())
  let sort = $state<Sort>(savedSort())
  let showHidden = $state(localStorage.getItem(HIDDEN_KEY) === "1")
  let query = $state<string | null>(null)
  let clipboard = $state<{ items: string[]; cut: boolean } | null>(null)
  let busy = $state(false)
  let prompt = $state<Prompt | null>(null)
  let deleting = $state<string[]>([])
  let confirming = $state(false)
  let details = $state<{
    entries: Entry[]
    size: number | null
    files: number | null
  } | null>(null)
  let sorting = $state(false)
  let visible = $state(true)
  let scroller = $state<HTMLElement>()
  let sequence = 0
  let press: { x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null
  let drag: { anchor: number; base: Set<string>; x: number; y: number } | null = null
  let held = false

  const locale = $derived(currentLocale())
  const dates = $derived(
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
  )
  const selecting = $derived(selected.size > 0)

  const shown = $derived.by(() => {
    const needle = query?.trim().toLowerCase() ?? ""
    const entries = (folder?.entries ?? []).filter(
      entry =>
        (showHidden || !entry.name.startsWith(".")) &&
        (!needle || entry.name.toLowerCase().includes(needle)),
    )

    return sortEntries(entries, sort, locale)
  })

  const categories = $derived(
    CATEGORIES.filter(category =>
      start?.entries.some(entry => entry.dir && entry.name === category.folder),
    ),
  )

  const rootName = (root: string) =>
    root === "/storage/emulated/0"
      ? m.files_mobile_internal()
      : root.slice(root.lastIndexOf("/") + 1)

  const crumbs = $derived.by(() => {
    if (!folder) {
      return []
    }

    const { root } = folder
    const rest = folder.path.slice(root.length).split("/").filter(Boolean)

    return [
      { name: rootName(root), path: root },
      ...rest.map((name, index) => ({
        name,
        path: `${root}/${rest.slice(0, index + 1).join("/")}`,
      })),
    ]
  })

  const go = (next: string | null) => {
    selected = new Set()
    query = null
    home = next === null
    path = next
  }

  const refresh = () => {
    reload += 1
  }

  const fail = (reason: unknown) => {
    const code = String(reason)
    const message = Object.hasOwn(ERRORS, code)
      ? ERRORS[code]
      : m.files_mobile_errors_failed

    toast(message(), "error")
  }

  export const back = () => {
    if (prompt || confirming || details || sorting) {
      prompt = null
      confirming = false
      details = null
      sorting = false

      return true
    }

    if (selecting) {
      selected = new Set()

      return true
    }

    if (query !== null) {
      query = null

      return true
    }

    if (home) {
      return false
    }

    go(folder?.parent ?? null)

    return true
  }

  const toggle = (entry: Entry) => {
    const next = new Set(selected)

    if (!next.delete(entry.path)) {
      next.add(entry.path)
    }

    selected = next
  }

  const tap = (entry: Entry) => {
    if (selecting) {
      toggle(entry)

      return
    }

    if (entry.dir) {
      go(entry.path)

      return
    }

    openFile(entry.path).catch(fail)
  }

  const extend = () => {
    if (!drag) {
      return
    }

    const row = document
      .elementFromPoint(drag.x, drag.y)
      ?.closest<HTMLElement>("[data-index]")

    if (!row) {
      return
    }

    const index = Number(row.dataset.index)
    const from = Math.min(drag.anchor, index)
    const to = Math.max(drag.anchor, index)

    selected = new Set([
      ...drag.base,
      ...shown.slice(from, to + 1).map(entry => entry.path),
    ])
  }

  const follow = () => {
    if (!drag || !scroller) {
      return
    }

    const box = scroller.getBoundingClientRect()

    if (drag.y < box.top + EDGE) {
      scroller.scrollTop -= STEP
      extend()
    } else if (drag.y > box.bottom - EDGE) {
      scroller.scrollTop += STEP
      extend()
    }

    requestAnimationFrame(follow)
  }

  const down = (e: PointerEvent, index: number) => {
    if (e.button !== 0) {
      return
    }

    const { clientX: x, clientY: y } = e

    clearTimeout(press?.timer)
    press = {
      x,
      y,
      timer: setTimeout(() => {
        press = null
        held = true
        drag = { anchor: index, base: new Set(selected), x, y }
        selected = new Set([...selected, shown[index].path])
        navigator.vibrate?.(15)
        requestAnimationFrame(follow)
      }, HOLD_MS),
    }
  }

  const move = (e: PointerEvent) => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) {
      clearTimeout(press.timer)
      press = null
    }

    if (drag) {
      drag.x = e.clientX
      drag.y = e.clientY
      extend()
    }
  }

  const up = () => {
    clearTimeout(press?.timer)
    press = null
    drag = null

    // the click that ends a long press lands after pointerup; a drag that left the row gets none
    if (held) {
      setTimeout(() => (held = false))
    }
  }

  const click = (entry: Entry) => {
    if (held) {
      held = false

      return
    }

    tap(entry)
  }

  const holdScroll = (node: HTMLElement) => {
    const block = (e: TouchEvent) => {
      if (drag) {
        e.preventDefault()
      }
    }

    node.addEventListener("touchmove", block, { passive: false })

    return () => node.removeEventListener("touchmove", block)
  }

  const chosen = () => [...selected]

  const focus = (field: HTMLInputElement) => {
    field.focus()
    field.select()
  }

  const focusName = (field: HTMLInputElement) => {
    const name = field.value
    const dot = name.lastIndexOf(".")
    const file =
      prompt?.kind === "rename" &&
      !folder?.entries.find(entry => entry.path === prompt?.target)?.dir

    field.focus()
    field.setSelectionRange(0, file && dot > 0 ? dot : name.length)
  }

  const run = async (work: Promise<unknown>, touched: string[]) => {
    busy = true

    try {
      await work
      selected = new Set()

      return true
    } catch (reason) {
      fail(reason)

      return false
    } finally {
      scanFiles(touched)
      busy = false
      refresh()
    }
  }

  const stash = async (cut: boolean) => {
    const items = chosen()

    try {
      await setClipboard(items, cut)
      clipboard = { items, cut }
      selected = new Set()
    } catch (reason) {
      fail(reason)
    }
  }

  const paste = async () => {
    const pending = clipboard

    if (!folder || home || !pending || busy) {
      return
    }

    clipboard = null
    busy = true

    try {
      const landed = await pasteItems(folder.path)

      scanFiles([...landed, ...(pending.cut ? pending.items : [])])
      toast(m.files_mobile_pasted({ count: landed.length }), "success")
    } catch (reason) {
      if (pending.cut) {
        scanFiles(pending.items)
      }

      fail(reason)
    } finally {
      busy = false
      refresh()
    }
  }

  const submit = async () => {
    if (!prompt || !folder || busy) {
      return
    }

    const name = prompt.value.trim()
    const { kind, target } = prompt

    if (!name) {
      return
    }

    const renamed = `${target.slice(0, target.lastIndexOf("/"))}/${name}`
    const done =
      kind === "newFolder"
        ? await run(newFolder(folder.path, name), [])
        : await run(renameItem(target, name), [target, renamed])

    if (done) {
      prompt = null
    }
  }

  const startRename = () => {
    const [target] = chosen()
    const name = target.slice(target.lastIndexOf("/") + 1)

    prompt = { kind: "rename", value: name, target }
  }

  const startDelete = () => {
    deleting = chosen()
    confirming = true
  }

  const measure = async (entry: Entry) => {
    if (!entry.dir) {
      return { size: entry.size, files: 1 }
    }

    const token = randomToken()
    const found = await usageScan(entry.path, token).finally(() =>
      usageForget(token),
    )

    return { size: found?.size ?? 0, files: found?.files ?? 0 }
  }

  const showDetails = async () => {
    const entries = shown.filter(entry => selected.has(entry.path))
    const opened = { entries, size: null, files: null }

    details = opened

    try {
      const measured = await Promise.all(entries.map(measure))

      if (details === opened) {
        details = {
          entries,
          size: measured.reduce((sum, part) => sum + part.size, 0),
          files: measured.reduce((sum, part) => sum + part.files, 0),
        }
      }
    } catch {
      return
    }
  }

  const pickSort = (key: SortKey) => {
    sort = {
      key,
      descending: sort.key === key ? !sort.descending : key !== "name",
    }
    localStorage.setItem(SORT_KEY, JSON.stringify(sort))
    sorting = false
  }

  const reloadNow = () => {
    sorting = false
    refresh()
  }

  const toggleHidden = () => {
    showHidden = !showHidden
    localStorage.setItem(HIDDEN_KEY, showHidden ? "1" : "0")
    sorting = false
  }

  const ACTIONS: Action[] = [
    { icon: "lucide:copy", label: m.files_mobile_copy, run: () => stash(false) },
    { icon: "lucide:scissors", label: m.files_mobile_move, run: () => stash(true) },
    {
      icon: "lucide:pencil",
      label: m.files_mobile_rename,
      run: startRename,
      single: true,
    },
    {
      icon: "lucide:share-2",
      label: m.files_mobile_share,
      run: () => shareFiles(chosen()).catch(fail),
      files: true,
    },
    { icon: "lucide:info", label: m.files_mobile_details, run: showDetails },
    { icon: "lucide:trash-2", label: m.files_mobile_delete, run: startDelete },
  ]

  const blocked = (action: Action) =>
    busy ||
    (action.single && selected.size !== 1) ||
    (action.files &&
      shown.some(entry => entry.dir && selected.has(entry.path)))

  $effect(() => {
    const track = () => {
      visible = document.visibilityState === "visible"
    }

    document.addEventListener("visibilitychange", track)

    return () => document.removeEventListener("visibilitychange", track)
  })

  $effect(() => {
    void reload

    if (!home || !visible) {
      return
    }

    listFolder(null)
      .then(found => {
        start = found
        problem = null

        for (const root of found.roots) {
          storageStats(root)
            .then(stat => {
              stats[root] = stat
            })
            .catch(() => undefined)
        }
      })
      .catch(reason => {
        problem = reason === "denied" ? "permission" : "failed"
      })
  })

  $effect(() => {
    const wanted = path

    void reload

    if (home || !visible || wanted === null) {
      return
    }

    const mine = ++sequence

    loading = true

    listFolder(wanted)
      .then(next => {
        if (mine === sequence) {
          folder = next
          problem = null
        }
      })
      .catch(reason => {
        if (mine !== sequence) {
          return
        }

        toast(
          reason === "denied"
            ? m.files_mobile_restricted()
            : m.files_mobile_errors_failed(),
          "error",
        )
        go(folder && folder.path !== wanted ? folder.path : null)
      })
      .finally(() => {
        if (mine === sequence) {
          loading = false
        }
      })
  })
</script>

<div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
  <header class="flex h-14 shrink-0 items-center gap-1 px-2">
    {#if selecting}
      <IconButton
        icon="lucide:x"
        label={m.files_mobile_clear_selection()}
        size="md"
        class="shrink-0"
        onclick={() => (selected = new Set())}
      />

      <span class="min-w-0 flex-1 truncate text-sm font-medium tabular-nums">
        {m.files_mobile_selected({ count: selected.size })}
      </span>

      <button
        type="button"
        class="btn btn-ghost btn-sm shrink-0"
        onclick={() => (selected = new Set(shown.map(entry => entry.path)))}
      >
        {m.files_mobile_select_all()}
      </button>
    {:else if query !== null}
      <IconButton
        icon="lucide:arrow-left"
        label={m.files_mobile_close_search()}
        size="md"
        class="shrink-0"
        onclick={() => (query = null)}
      />

      <SearchField
        class="flex-1"
        label={m.files_mobile_search()}
        bind:value={() => query ?? "", next => (query = next)}
        {@attach focus}
      />
    {:else if home}
      <Icon icon="lucide:folder" class="mx-2 size-4 shrink-0 text-base-content/60" />
      <h1 class="min-w-0 flex-1 truncate text-sm font-semibold">
        {m.files_mobile_title()}
      </h1>
      {@render actions?.()}
    {:else}
      <nav
        class="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto scrollbar-none"
        aria-label={m.files_mobile_location()}
      >
        <IconButton
          icon="lucide:house"
          label={m.files_mobile_title()}
          size="md"
          class="shrink-0"
          onclick={() => go(null)}
        />

        {#each crumbs as crumb (crumb.path)}
          <Icon
            icon="lucide:chevron-right"
            class="size-4 shrink-0 text-base-content/40"
          />

          <button
            type="button"
            class={[
              "btn btn-ghost btn-sm max-w-40 shrink-0 font-normal",
              crumb.path === folder?.path && "font-semibold",
            ]}
            title={crumb.name}
            aria-current={crumb.path === folder?.path ? "location" : undefined}
            onclick={() => go(crumb.path)}
          >
            <span class="min-w-0 truncate">{crumb.name}</span>
          </button>
        {/each}
      </nav>

      <IconButton
        icon="lucide:search"
        label={m.files_mobile_search()}
        size="md"
        class="shrink-0"
        onclick={() => (query = "")}
      />

      <IconButton
        icon="lucide:arrow-up-down"
        label={m.files_mobile_sort_title()}
        size="md"
        class="shrink-0"
        onclick={() => (sorting = true)}
      />

      {@render actions?.()}
    {/if}
  </header>

  <section
    class="min-h-0 flex-1 overflow-y-auto"
    bind:this={scroller}
    {@attach holdScroll}
  >
    {#if problem === "permission"}
      <EmptyState
        icon="lucide:folder-lock"
        text={m.files_share_storage_denied()}
        centered
      >
        <button
          type="button"
          class="btn btn-primary btn-sm"
          onclick={() => requestStorage().catch(fail)}
        >
          {m.files_mobile_allow_access()}
        </button>
      </EmptyState>
    {:else if problem === "failed"}
      <EmptyState
        icon="lucide:circle-alert"
        text={m.files_mobile_errors_failed()}
        centered
      >
        <button type="button" class="btn btn-sm" onclick={refresh}>
          {m.files_mobile_retry()}
        </button>
      </EmptyState>
    {:else if home && start}
      <div class="flex flex-col gap-6 px-4 pt-2 pb-4">
        {#if categories.length > 0}
          <div class="grid grid-cols-3 gap-2">
            {#each categories as category (category.folder)}
              <button
                type="button"
                class={[
                  "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2",
                  "rounded-box bg-base-content/5 transition-colors duration-140",
                  "hover:bg-base-content/8 active:bg-base-content/10",
                ]}
                onclick={() => go(`${start?.root}/${category.folder}`)}
              >
                <span
                  class={[
                    "flex size-11 items-center justify-center rounded-full",
                    category.tone,
                  ]}
                >
                  <Icon icon={category.icon} class="size-6" />
                </span>
                <span class="max-w-full truncate px-1 text-sm">
                  {category.label()}
                </span>
              </button>
            {/each}
          </div>
        {/if}

        <div class="flex flex-col gap-2">
          <h2 class="px-1 text-sm font-medium text-base-content/70">
            {m.files_mobile_storage()}
          </h2>

          {#each start.roots as root (root)}
            {@const stat = stats[root]}
            {@const name = rootName(root)}

            <button
              type="button"
              class={[
                "flex min-h-16 cursor-pointer items-center gap-3 rounded-box px-4 py-3 text-left",
                "bg-base-content/5 transition-colors duration-140",
                "hover:bg-base-content/8 active:bg-base-content/10",
              ]}
              onclick={() => go(root)}
            >
              <Icon
                icon={root === start.root ? "lucide:smartphone" : "lucide:card-sim"}
                class="size-6 shrink-0 text-primary"
              />

              <span class="flex min-w-0 flex-1 flex-col gap-1.5">
                <span class="flex items-baseline justify-between gap-2">
                  <span class="min-w-0 truncate text-sm font-medium" title={name}>
                    {name}
                  </span>
                  {#if stat}
                    <span
                      class="shrink-0 text-xs whitespace-nowrap text-base-content/60 tabular-nums"
                    >
                      {m.files_mobile_usage({
                        used: formatBytes(stat.total - stat.free, locale),
                        total: formatBytes(stat.total, locale),
                      })}
                    </span>
                  {/if}
                </span>

                <progress
                  class="progress progress-primary h-1.5 w-full"
                  value={stat ? stat.total - stat.free : 0}
                  max={stat?.total ?? 1}
                ></progress>
              </span>
            </button>
          {/each}
        </div>
      </div>
    {:else if !home && folder && shown.length === 0 && !loading}
      <EmptyState
        icon={query ? "lucide:search-x" : "lucide:folder-open"}
        text={query ? m.files_mobile_no_matches() : m.files_share_files_empty()}
        centered
      />
    {/if}

    <ul class={["flex flex-col px-2 pb-24", home && "hidden"]}>
      {#each shown as entry, index (entry.path)}
        {@const picked = selected.has(entry.path)}

        <li style="content-visibility: auto; contain-intrinsic-size: auto 3.5rem">
          <button
            type="button"
            data-index={index}
            class={[
              "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-field px-2 py-2",
              "text-left select-none transition-colors duration-140",
              picked
                ? "bg-primary/8 text-primary"
                : "hover:bg-base-content/8 active:bg-base-content/10",
            ]}
            style="-webkit-touch-callout: none"
            aria-pressed={selecting ? picked : undefined}
            onclick={() => click(entry)}
            oncontextmenu={e => e.preventDefault()}
            onpointerdown={e => down(e, index)}
            onpointermove={move}
            onpointerup={up}
            onpointercancel={up}
          >
            {#if selecting}
              <Icon
                icon={picked ? "lucide:circle-check" : "lucide:circle"}
                class={["size-5 shrink-0", !picked && "text-base-content/40"]}
              />
            {/if}

            {#if !entry.dir && isMedia(entry.name)}
              <MobileThumb
                path={entry.path}
                modified={entry.modified}
                icon={iconOf(entry)}
              />
            {:else}
              <span class="flex size-10 shrink-0 items-center justify-center">
                <Icon icon={iconOf(entry)} class="size-8" />
              </span>
            {/if}

            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-sm" title={entry.name}>{entry.name}</span>
              <span
                class="flex gap-3 text-xs whitespace-nowrap text-base-content/55 tabular-nums"
              >
                {#if entry.modified}
                  <span>{dates.format(entry.modified)}</span>
                {/if}

                {#if !entry.dir}
                  <span>{formatBytes(entry.size, locale)}</span>
                {/if}
              </span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  </section>

  {#if selecting}
    <div class="mx-2 mb-2 grid shrink-0 grid-cols-6 rounded-box bg-base-content/5 p-1">
      {#each ACTIONS as action (action.icon)}
        <button
          type="button"
          class={[
            "flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center gap-1",
            "rounded-field text-xs transition-colors duration-140",
            "hover:bg-base-content/8 active:bg-base-content/10",
            "disabled:cursor-not-allowed disabled:opacity-40",
          ]}
          disabled={blocked(action)}
          onclick={action.run}
        >
          <Icon icon={action.icon} class="size-5 shrink-0" />
          <span class="max-w-full truncate px-0.5">{action.label()}</span>
        </button>
      {/each}
    </div>
  {:else if busy}
    <div
      class="mx-2 mb-2 flex min-h-14 shrink-0 items-center gap-3 rounded-box bg-base-content/5 px-4 text-sm"
    >
      <span class="loading loading-spinner loading-sm text-primary"></span>
      {m.files_mobile_working()}
    </div>
  {:else if clipboard && !home}
    {@const count = clipboard.items.length}

    <div
      class="mx-2 mb-2 flex min-h-14 shrink-0 items-center gap-2 rounded-box bg-base-content/5 px-4"
    >
      <span class="min-w-0 flex-1 truncate text-sm tabular-nums">
        {clipboard.cut
          ? m.files_mobile_moving({ count })
          : m.files_mobile_copying({ count })}
      </span>
      <button
        type="button"
        class="btn btn-ghost btn-sm shrink-0"
        onclick={() => (clipboard = null)}
      >
        {m.files_mobile_cancel()}
      </button>
      <button type="button" class="btn btn-primary btn-sm shrink-0" onclick={paste}>
        {m.files_mobile_paste_here()}
      </button>
    </div>
  {:else if folder && !home}
    <button
      type="button"
      class="btn btn-circle btn-primary btn-lg absolute right-4 bottom-4 shadow-lg"
      aria-label={m.files_mobile_new_folder()}
      title={m.files_mobile_new_folder()}
      onclick={() => (prompt = { kind: "newFolder", value: "", target: "" })}
    >
      <Icon icon="lucide:folder-plus" class="size-6" />
    </button>
  {/if}
</div>

<Modal
  bind:open={
    () => prompt !== null,
    next => {
      if (!next) {
        prompt = null
      }
    }
  }
  label={prompt?.kind === "rename" ? m.files_mobile_rename() : m.files_mobile_new_folder()}
  class="w-full max-w-sm"
>
  {#if prompt}
    <form
      class="flex flex-col gap-3 p-5"
      onsubmit={e => {
        e.preventDefault()
        submit()
      }}
    >
      <h3 class="text-sm font-semibold">
        {prompt.kind === "newFolder" ? m.files_mobile_new_folder() : m.files_mobile_rename()}
      </h3>
      <input
        class="input w-full"
        aria-label={prompt.kind === "newFolder" ? m.files_mobile_new_folder() : m.files_mobile_rename()}
        autocomplete="off"
        spellcheck="false"
        bind:value={prompt.value}
        {@attach focusName}
      />
      <div class="mt-2 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost btn-sm" onclick={() => (prompt = null)}>
          {m.files_mobile_cancel()}
        </button>
        <button type="submit" class="btn btn-primary btn-sm" disabled={busy}>
          {m.files_mobile_confirm()}
        </button>
      </div>
    </form>
  {/if}
</Modal>

<Modal bind:open={sorting} label={m.files_mobile_sort_title()} class="w-full max-w-sm">
  <div class="flex flex-col gap-1 p-3">
    <h3 class="px-3 pt-2 pb-1 text-sm font-semibold">{m.files_mobile_sort_title()}</h3>

    {#each SORTS as option (option.key)}
      {@const active = sort.key === option.key}

      <button
        type="button"
        class={[
          "flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-field px-3 text-sm",
          "transition-colors duration-140",
          active ? "bg-primary/8 text-primary" : "hover:bg-base-content/8",
        ]}
        aria-pressed={active}
        onclick={() => pickSort(option.key)}
      >
        {option.label()}
        {#if active}
          <Icon
            icon={sort.descending ? "lucide:arrow-down" : "lucide:arrow-up"}
            class="size-4 shrink-0"
          />
        {/if}
      </button>
    {/each}

    <button
      type="button"
      class={[
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-field px-3 text-sm",
        "transition-colors duration-140 hover:bg-base-content/8",
      ]}
      onclick={reloadNow}
    >
      <Icon icon="lucide:refresh-cw" class="size-4 shrink-0" />
      {m.files_mobile_refresh()}
    </button>

    <label
      class={[
        "flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-field px-3 text-sm",
        "transition-colors duration-140 hover:bg-base-content/8",
      ]}
    >
      {m.files_mobile_show_hidden()}
      <input
        type="checkbox"
        class="toggle toggle-sm toggle-primary"
        checked={showHidden}
        onchange={toggleHidden}
      />
    </label>
  </div>
</Modal>

<Modal
  bind:open={
    () => details !== null,
    next => {
      if (!next) {
        details = null
      }
    }
  }
  label={m.files_mobile_details()}
  class="w-full max-w-sm"
>
  {#if details}
    {@const [only] = details.entries.length === 1 ? details.entries : []}

    <div class="flex flex-col gap-3 p-5 text-sm">
      <h3 class="font-semibold break-all">
        {only ? only.name : m.files_mobile_selected({ count: details.entries.length })}
      </h3>

      <dl class="flex flex-col gap-1.5">
        {#if only}
          <div class="flex gap-4">
            <dt class="w-24 shrink-0 text-base-content/55">{m.files_mobile_path()}</dt>
            <dd class="min-w-0 break-all select-text">{only.path}</dd>
          </div>
        {/if}

        <div class="flex gap-4">
          <dt class="w-24 shrink-0 text-base-content/55">{m.files_mobile_size()}</dt>
          <dd class="min-w-0 tabular-nums">
            {details.size === null
              ? m.files_mobile_measuring()
              : formatBytes(details.size, locale)}
          </dd>
        </div>

        {#if details.files !== null && (!only || only.dir)}
          <div class="flex gap-4">
            <dt class="w-24 shrink-0 text-base-content/55">{m.files_mobile_contents()}</dt>
            <dd class="min-w-0 tabular-nums">
              {m.files_mobile_file_count({ count: details.files })}
            </dd>
          </div>
        {/if}

        {#if only}
          <div class="flex gap-4">
            <dt class="w-24 shrink-0 text-base-content/55">{m.files_mobile_modified()}</dt>
            <dd class="min-w-0 tabular-nums">{dates.format(only.modified)}</dd>
          </div>
        {/if}
      </dl>

      <div class="mt-2 flex gap-2">
        {#if only && !only.dir}
          <button
            type="button"
            class="btn btn-sm flex-1"
            onclick={() => openWith(only.path).catch(fail)}
          >
            {m.files_mobile_open_with()}
          </button>
        {/if}
        <button type="button" class="btn btn-sm flex-1" onclick={() => (details = null)}>
          {m.files_mobile_close()}
        </button>
      </div>
    </div>
  {/if}
</Modal>

<ConfirmDialog
  bind:open={confirming}
  title={m.files_mobile_delete_title()}
  body={deleting.length === 1
    ? m.files_mobile_delete_one({
        name: deleting[0].slice(deleting[0].lastIndexOf("/") + 1),
      })
    : m.files_mobile_delete_body({ count: deleting.length })}
  action={m.files_mobile_delete()}
  onconfirm={() => run(deleteItems(deleting), deleting)}
/>
