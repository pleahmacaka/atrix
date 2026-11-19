<script lang="ts">
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import ResizeHandle from "#lib/components/ui/ResizeHandle.svelte"
  import { m } from "#lib/paraglide/messages.js"
  import {
    acceptTabs,
    adoptTab,
    defaultShell,
    PaneArea,
    popOut,
    session,
    sessionShortcut,
    setHost,
    TabStrip,
  } from "#lib/terminal/index.ts"
  import { resizeHandle } from "../../pointer"
  import { type Explorer, fail } from "../../store/explorer.svelte"
  import { terminal, terminalPrefs } from "../../store/terminal.svelte"

  let { explorer }: { explorer: Explorer } = $props()

  const side = $derived(
    (terminal.position ?? terminalPrefs.position) === "side",
  )

  setHost({
    shell: () => defaultShell(terminalPrefs.shell),
    cwd: () => (explorer.filesystem ? explorer.tab.location : null),
    empty: () => (terminal.open = false),
  })

  $effect(() =>
    acceptTabs(handoff => {
      terminal.open = true
      adoptTab(handoff)
    }),
  )

  const onkeydowncapture = (e: KeyboardEvent) => {
    if (sessionShortcut(e)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const resizeWidth = {
    axis: "x",
    invert: true,
    min: 16,
    max: 60,
    get: () => terminalPrefs.width,
    set: (width: number) => (terminalPrefs.width = width),
  } as const

  const resizeHeight = {
    axis: "y",
    invert: true,
    min: 6,
    max: 40,
    get: () => terminalPrefs.height,
    set: (height: number) => (terminalPrefs.height = height),
  } as const
</script>

{#if session.tabs.length > 0}
  {#if terminal.open}
    {@const resize = side ? resizeWidth : resizeHeight}
    <ResizeHandle
      axis={resize.axis}
      label={m.files_terminal_resize()}
      onpointerdown={resizeHandle(resize)}
    />
  {/if}

  <section
    aria-label={m.files_terminal_title()}
    class={[
      "island flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden",
      !terminal.open && "hidden",
    ]}
    style:height={side ? undefined : `${terminalPrefs.height}rem`}
    style:width={side ? `${terminalPrefs.width}rem` : undefined}
    {onkeydowncapture}
  >
    <header class="flex h-10 shrink-0 items-center gap-1 px-1.5 select-none">
      <TabStrip />

      <div class="min-w-2 flex-1"></div>

      <IconButton
        icon={side ? "lucide:panel-bottom" : "lucide:panel-right"}
        label={side ? m.files_terminal_to_bottom() : m.files_terminal_to_side()}
        class="shrink-0"
        onclick={() => (terminal.position = side ? "bottom" : "side")}
      />

      <IconButton
        icon="lucide:square-arrow-out-up-right"
        label={m.files_terminal_pop_out()}
        class="shrink-0"
        onclick={() => popOut().catch(fail)}
      />

      <IconButton
        icon="lucide:x"
        label={m.files_terminal_close()}
        class="shrink-0"
        onclick={() => (terminal.open = false)}
      />
    </header>

    <div class="flex min-h-0 flex-1">
      <PaneArea visible={terminal.open} />
    </div>
  </section>
{/if}
