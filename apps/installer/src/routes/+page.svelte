<script lang="ts">
import Icon from "@iconify/svelte"
import { getCurrentWindow } from "@tauri-apps/api/window"
import ComponentList from "#lib/components/ComponentList.svelte"
import Logo from "#lib/components/Logo.svelte"
import Screen from "#lib/components/Screen.svelte"
import StepList from "#lib/components/StepList.svelte"
import {
  apply,
  type Components,
  differs,
  launch,
  type Overview,
  onStep,
  overview,
  type Step,
  uninstall,
} from "#lib/installer.ts"
import { m } from "#lib/messages.ts"

type View = "welcome" | "select" | "manage" | "confirm" | "progress" | "done"

type Task = "install" | "change" | "remove"

const RUNNING: Record<Task, string> = {
  install: m.install_running,
  change: m.change_running,
  remove: m.remove_running,
}

const DONE: Record<Task, string> = {
  install: m.install_done,
  change: m.change_done,
  remove: m.remove_done,
}

const FAILED: Record<Task, string> = {
  install: m.install_failed,
  change: m.change_failed,
  remove: m.remove_failed,
}

let info = $state<Overview>()
let chosen = $state<Components>({ shell: false, files: false, terminal: true })
let view = $state<View>("welcome")
let task = $state<Task>("install")
let steps = $state<Step[]>([])
let error = $state<string>()
let launchError = $state<string>()

const changed = $derived(
  info !== undefined && (info.outdated || differs(chosen, info.components)),
)

const load = async () => {
  info = await overview()
  chosen = { ...info.components }
  view = info.installed ? "manage" : "welcome"
}

const record = (step: Step) => {
  steps = steps.some(s => s.id === step.id)
    ? steps.map(s => (s.id === step.id ? step : s))
    : [...steps, step]
}

const run = async (next: Task, work: () => Promise<void>) => {
  task = next
  steps = []
  error = undefined
  view = "progress"

  await work().catch(reason => {
    error = String(reason)
  })

  view = "done"
}

const close = () => getCurrentWindow().close()

const start = () =>
  launch().catch(reason => {
    launchError = String(reason)
  })

$effect(() => {
  const stop = onStep(record)

  load()

  return () => {
    stop.then(off => off())
  }
})
</script>

{#if info}
  {#if view === "welcome"}
    <Screen title={m.install_title} lead={m.version(info.version)}>
      <div
        class="island flex grow flex-col items-center justify-center gap-4 p-6"
      >
        <Logo class="size-20" />
        <p class="text-center text-sm text-base-content/70">
          {m.welcome_lead}
        </p>
        {#if !info.available}
          <div role="alert" class="alert alert-error alert-soft text-sm">
            <Icon icon="lucide:circle-alert" class="size-4 shrink-0" />
            {m.missing_payload}
          </div>
        {/if}
      </div>
      {#snippet actions()}
        <button
          type="button"
          class="btn btn-primary"
          disabled={!info?.available}
          onclick={() => (view = "select")}
        >
          {m.next}
        </button>
      {/snippet}
    </Screen>
  {:else if view === "select"}
    <Screen title={m.select_title} lead={m.select_lead}>
      <ComponentList platform={info.platform} bind:value={chosen} />
      {#snippet actions()}
        <button
          type="button"
          class="btn btn-ghost"
          onclick={() => (view = "welcome")}
        >
          {m.back}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          onclick={() => run("install", () => apply(chosen))}
        >
          {m.install}
        </button>
      {/snippet}
    </Screen>
  {:else if view === "manage"}
    <Screen title={m.manage_title} lead={m.manage_lead}>
      <ComponentList platform={info.platform} bind:value={chosen} />
      {#if info.outdated}
        <div role="status" class="alert alert-info alert-soft text-sm">
          <Icon icon="lucide:circle-arrow-up" class="size-4 shrink-0" />
          {m.outdated(info.version)}
        </div>
      {/if}
      {#snippet actions()}
        <button
          type="button"
          class="btn btn-ghost me-auto text-error"
          onclick={() => (view = "confirm")}
        >
          <Icon icon="lucide:trash-2" class="size-4" />
          {m.remove}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          disabled={!changed}
          onclick={() => run("change", () => apply(chosen))}
        >
          {m.apply}
        </button>
      {/snippet}
    </Screen>
  {:else if view === "confirm"}
    <Screen title={m.remove_title}>
      <div
        class="island flex grow flex-col items-center justify-center gap-4 p-6"
      >
        <Icon icon="lucide:trash-2" class="size-12 text-error" />
        <p class="text-center text-sm text-base-content/70">
          {m.remove_lead}
        </p>
      </div>
      {#snippet actions()}
        <button
          type="button"
          class="btn btn-ghost"
          onclick={() => (view = "manage")}
        >
          {m.cancel}
        </button>
        <button
          type="button"
          class="btn btn-error"
          onclick={() => run("remove", uninstall)}
        >
          {m.remove}
        </button>
      {/snippet}
    </Screen>
  {:else if view === "progress"}
    <Screen title={RUNNING[task]}>
      <StepList {steps} />
    </Screen>
  {:else}
    <Screen
      title={error ? FAILED[task] : DONE[task]}
      lead={error ? m.failed_lead : undefined}
    >
      <StepList {steps} />
      {#if error ?? launchError}
        <div role="alert" class="alert alert-error alert-soft text-sm">
          <Icon icon="lucide:circle-alert" class="size-4 shrink-0" />
          <span class="min-w-0 wrap-anywhere select-text">
            {error ?? launchError}
          </span>
        </div>
      {/if}
      {#snippet actions()}
        {#if error}
          <button type="button" class="btn btn-ghost" onclick={load}>
            {m.retry}
          </button>
        {/if}
        {#if !error && task === "install"}
          <button type="button" class="btn btn-ghost" onclick={close}>
            {m.close}
          </button>
          <button type="button" class="btn btn-primary" onclick={start}>
            {m.launch}
          </button>
        {:else}
          <button type="button" class="btn btn-primary" onclick={close}>
            {m.close}
          </button>
        {/if}
      {/snippet}
    </Screen>
  {/if}
{/if}
