<script lang="ts">
  import Icon from "@iconify/svelte"
  import IconButton from "#lib/components/ui/IconButton.svelte"
  import Modal from "#lib/components/ui/Modal.svelte"
  import Section from "#lib/components/ui/Section.svelte"
  import SettingRow from "#lib/components/ui/SettingRow.svelte"
  import { m } from "#lib/paraglide/messages.js"
  import { type DefaultApp, defaultAppStatus } from "../../native"
  import type { Explorer } from "../../store/explorer.svelte"
  import { prefs } from "../../store/prefs.svelte"
  import DecorSettings from "../settings/DecorSettings.svelte"
  import DefaultAppRows from "../settings/DefaultAppRows.svelte"
  import MiniExplorer from "./MiniExplorer.svelte"

  type Step = "welcome" | "layout" | "tidy" | "integrate" | "done"

  type Toggle = "preview" | "showHidden" | "showExtensions"

  let { explorer }: { explorer: Explorer } = $props()

  const STEPS: { id: Step; label: () => string }[] = [
    { id: "welcome", label: m.files_setup_steps_welcome },
    { id: "layout", label: m.files_setup_steps_layout },
    { id: "tidy", label: m.files_setup_steps_tidy },
    { id: "integrate", label: m.files_setup_steps_integrate },
    { id: "done", label: m.files_setup_steps_done },
  ]

  const HEADINGS: Partial<
    Record<Step, { title: () => string; blurb: () => string }>
  > = {
    layout: {
      title: m.files_setup_layout_title,
      blurb: m.files_setup_layout_blurb,
    },
    tidy: { title: m.files_setup_tidy_title, blurb: m.files_setup_tidy_blurb },
    integrate: {
      title: m.files_setup_integrate_title,
      blurb: m.files_setup_integrate_blurb,
    },
  }

  const FEATURES = [
    {
      icon: "lucide:panels-top-left",
      title: m.files_setup_welcome_tabs,
      text: m.files_setup_welcome_tabs_text,
    },
    {
      icon: "lucide:monitor-smartphone",
      title: m.files_setup_welcome_devices,
      text: m.files_setup_welcome_devices_text,
    },
    {
      icon: "lucide:square-terminal",
      title: m.files_setup_welcome_terminal,
      text: m.files_setup_welcome_terminal_text,
    },
  ]

  const LAYOUTS = [
    {
      compact: false,
      title: m.files_setup_layout_full,
      text: m.files_setup_layout_full_text,
    },
    {
      compact: true,
      title: m.files_setup_layout_compact,
      text: m.files_setup_layout_compact_text,
    },
  ]

  const TOGGLES: { key: Toggle; label: () => string }[] = [
    { key: "preview", label: m.files_settings_preview_pane },
    { key: "showHidden", label: m.files_settings_show_hidden },
    { key: "showExtensions", label: m.files_settings_show_extensions },
  ]

  let at = $state(0)
  let handler = $state<DefaultApp>({ supported: false, enabled: false })

  const step = $derived(STEPS[at])
  const last = $derived(at === STEPS.length - 1)
  const heading = $derived(HEADINGS[step.id])

  const onOff = (on: boolean) =>
    on ? m.files_setup_done_on() : m.files_setup_done_off()

  const summary = $derived([
    {
      icon: "lucide:panel-top",
      label: m.files_setup_done_toolbar(),
      value: prefs.compactToolbar
        ? m.files_setup_done_compact()
        : m.files_setup_done_full(),
    },
    {
      icon: "lucide:panel-right",
      label: m.files_setup_done_preview(),
      value: onOff(prefs.preview),
    },
    {
      icon: "lucide:trash-2",
      label: m.files_setup_done_cleanup(),
      value: prefs.cleanup
        ? m.files_settings_cleanup_hours_value({ hours: prefs.cleanupHours })
        : m.files_setup_done_off(),
    },
    {
      icon: "lucide:folder-check",
      label: m.files_setup_done_default_app(),
      value: onOff(handler.enabled),
    },
  ])

  const finish = () => {
    prefs.setupDone = true
    explorer.setupOpen = false
  }

  const next = () => {
    if (last) {
      finish()
    } else {
      at += 1
    }
  }

  const onkeydown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.defaultPrevented) {
      return
    }

    const target = e.target as HTMLElement | null

    if (target?.closest("input, button, select, textarea, a, [role=option]")) {
      return
    }

    e.preventDefault()
    next()
  }

  $effect(() => {
    defaultAppStatus()
      .then(status => (handler = status))
      .catch(() => undefined)
  })
</script>

<svelte:window {onkeydown} />

<Modal
  bind:open={() => explorer.setupOpen, open => !open && finish()}
  label={m.files_setup_title()}
  class="h-160 w-full max-w-4xl overflow-hidden"
>
  <header class="flex shrink-0 items-center gap-4 px-5 pt-4 pb-2">
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <Icon icon="lucide:folder-open" class="size-5 shrink-0 text-primary" />
      <h2 class="truncate text-sm font-semibold">{m.files_setup_title()}</h2>
    </div>

    <ol class="flex shrink-0 items-center gap-1.5" aria-label={step.label()}>
      {#each STEPS as entry, index (entry.id)}
        <li class="flex">
          <button
            type="button"
            class={[
              "h-1.5 cursor-pointer rounded-full transition-all duration-140",
              index === at
                ? "w-6 bg-primary"
                : index < at
                  ? "w-1.5 bg-primary/50 hover:bg-primary/80"
                  : "w-1.5 bg-base-content/20 hover:bg-base-content/40",
            ]}
            aria-label={entry.label()}
            title={entry.label()}
            aria-current={index === at ? "step" : undefined}
            onclick={() => (at = index)}
          ></button>
        </li>
      {/each}
    </ol>

    <div class="flex min-w-0 flex-1 justify-end">
      <IconButton icon="lucide:x" label={m.common_close()} onclick={finish} />
    </div>
  </header>

  <section
    class="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-3"
    aria-label={step.label()}
  >
    {#if step.id === "welcome"}
      <div
        class="flex flex-1 flex-col items-center justify-center gap-8 text-center"
      >
        <span
          class="flex size-16 items-center justify-center rounded-box bg-primary/8 text-primary"
        >
          <Icon icon="lucide:folder-open" class="size-8" />
        </span>

        <div class="flex flex-col gap-2">
          <h2 class="text-2xl font-semibold">{m.files_setup_welcome_title()}</h2>
          <p class="text-sm text-base-content/60">
            {m.files_setup_welcome_tagline()}
          </p>
        </div>

        <ul
          class="grid w-full max-w-2xl grid-cols-3 gap-3 text-left max-sm:grid-cols-1"
        >
          {#each FEATURES as feature (feature.icon)}
            <li
              class="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-4"
            >
              <span
                class="flex size-8 items-center justify-center rounded-field bg-primary/8 text-primary"
              >
                <Icon icon={feature.icon} class="size-4" />
              </span>
              <span class="text-sm font-medium">{feature.title()}</span>
              <span class="text-xs text-base-content/60">{feature.text()}</span>
            </li>
          {/each}
        </ul>
      </div>
    {:else if step.id === "done"}
      <div
        class="flex flex-1 flex-col items-center justify-center gap-8 text-center"
      >
        <span
          class="flex size-16 items-center justify-center rounded-box bg-success/12 text-success"
        >
          <Icon icon="lucide:check" class="size-8" />
        </span>

        <div class="flex flex-col gap-2">
          <h2 class="text-2xl font-semibold">{m.files_setup_done_title()}</h2>
          <p class="text-sm text-base-content/60">
            {m.files_setup_done_blurb()}
          </p>
        </div>

        <div class="w-full max-w-md text-left">
          <Section>
            {#each summary as entry (entry.icon)}
              <SettingRow icon={entry.icon} title={entry.label}>
                <span class="text-sm text-base-content/60">{entry.value}</span>
              </SettingRow>
            {/each}
          </Section>
        </div>
      </div>
    {:else}
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {#if heading}
          <div class="flex flex-col gap-1">
            <h2 class="text-xl font-semibold">{heading.title()}</h2>
            <p class="text-sm text-base-content/60">{heading.blurb()}</p>
          </div>
        {/if}

        {#if step.id === "layout"}
          <div class="flex gap-6">
            <div class="flex min-w-0 flex-1 flex-col gap-6">
              <fieldset class="grid min-w-0 grid-cols-2 gap-3">
                {#each LAYOUTS as layout (layout.compact)}
                  {@const selected = prefs.compactToolbar === layout.compact}

                  <button
                    type="button"
                    aria-pressed={selected}
                    class={[
                      "flex min-w-0 cursor-pointer flex-col gap-2 rounded-box border p-3 text-left",
                      "transition-colors duration-140",
                      selected
                        ? "border-primary/40 bg-primary/8"
                        : "border-base-300 bg-base-100 hover:bg-base-content/4",
                    ]}
                    onclick={() => (prefs.compactToolbar = layout.compact)}
                  >
                    <MiniExplorer compact={layout.compact} preview={false} />
                    <span
                      class={["text-sm font-medium", selected && "text-primary"]}
                    >
                      {layout.title()}
                    </span>
                    <span class="text-xs text-base-content/60">
                      {layout.text()}
                    </span>
                  </button>
                {/each}
              </fieldset>

              <Section title={m.files_settings_display()}>
                {#each TOGGLES as toggle (toggle.key)}
                  <SettingRow title={toggle.label()}>
                    <input
                      type="checkbox"
                      class="toggle toggle-sm toggle-primary"
                      aria-label={toggle.label()}
                      bind:checked={prefs[toggle.key]}
                    />
                  </SettingRow>
                {/each}
              </Section>
            </div>

            <div class="w-72 shrink-0 max-md:hidden">
              <div class="sticky top-0">
                <MiniExplorer
                  compact={prefs.compactToolbar}
                  preview={prefs.preview}
                />
              </div>
            </div>
          </div>
        {:else if step.id === "tidy"}
          <DecorSettings />
        {:else}
          <Section>
            <DefaultAppRows bind:handler windows={false} />
          </Section>
        {/if}
      </div>
    {/if}
  </section>

  <footer class="flex shrink-0 items-center justify-between gap-2 px-5 pt-2 pb-4">
    <button
      type="button"
      class="btn btn-ghost btn-sm"
      disabled={at === 0}
      onclick={() => (at -= 1)}
    >
      <Icon icon="lucide:arrow-left" class="size-4" />
      {m.common_back()}
    </button>

    <button type="button" class="btn btn-primary btn-sm" onclick={next}>
      {at === 0
        ? m.files_setup_start()
        : last
          ? m.files_setup_finish()
          : m.common_next()}

      {#if !last}
        <Icon icon="lucide:arrow-right" class="size-4" />
      {/if}
    </button>
  </footer>
</Modal>
