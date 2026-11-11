<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { ConfigDoc, HarnessConfig } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import DocEditor from "./DocEditor.svelte"
import ProfileDialog from "./ProfileDialog.svelte"
import SkillsTab from "./SkillsTab.svelte"

const SKILLS = "skills"

const docLabel = (doc: ConfigDoc) => {
  if (doc.id === "mcp") {
    return m.harness_doc_mcp()
  }

  if (doc.id === "settings") {
    return doc.format === "toml"
      ? m.harness_doc_settings_mcp()
      : m.harness_doc_settings()
  }

  return m.harness_doc_instructions()
}

const DOC_ICONS: Record<string, string> = {
  instructions: "lucide:file-text",
  settings: "lucide:settings-2",
  mcp: "lucide:plug",
}

let {
  host,
  harnessId,
  onSelect,
}: {
  host: HostView
  harnessId: string
  onSelect: (id: string | null, notice?: string) => void
} = $props()

const attempt = new Attempt()

let config = $state<HarnessConfig | null>(null)

let tab = $state("instructions")

let profileOpen = $state(false)

let removing = $state(false)

const harness = $derived(
  host.state?.harnesses.find(h => h.id === harnessId) ?? null,
)

const kind = $derived(harness?.kind ?? null)

const doc = $derived(config?.docs.find(d => d.id === tab) ?? null)

const reload = () =>
  attempt.run(async () => {
    config = await host.readHarness(harnessId)
  })

$effect(() => {
  if (kind && harnessId) {
    untrack(() => {
      config = null
      tab = "instructions"
      reload()
    })
  }
})

const removeProfile = () => {
  if (!removing) {
    removing = true

    return
  }

  attempt.run(async () => {
    await host.removeProfile(harnessId)
    onSelect(null)
  })
}
</script>

{#if harness}
  <div class="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-6 pb-6">
    <header class="flex flex-wrap items-center gap-3 pb-4">
      <span class="grid size-10 shrink-0 place-items-center rounded-box bg-base-200">
        <Icon
          icon={harness.profile ? "lucide:user-round" : "lucide:box"}
          class="size-5 text-base-content/70"
        />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h1 class="min-w-0 truncate text-lg font-semibold">
            {harness.profile ?? harness.name}
          </h1>
          <span class="badge badge-ghost badge-sm whitespace-nowrap">
            <Icon
              icon={harness.profile ? "lucide:git-fork" : "lucide:globe"}
              class="size-3"
            />
            {harness.profile ? m.harness_profile() : m.harness_global()}
          </span>
        </div>
        <p
          class="flex items-center gap-1 truncate text-xs text-base-content/60"
          title={config?.dir}
        >
          <Icon icon="lucide:folder" class="size-3 shrink-0" />
          {config?.dir ?? harness.name}
        </p>
      </div>
      {#if harness.kind && !harness.profile}
        <button
          type="button"
          class="btn btn-sm"
          onclick={() => {
            profileOpen = true
          }}
        >
          <Icon icon="lucide:git-fork" class="size-4" />
          {m.harness_new_profile()}
        </button>
      {/if}
      {#if harness.profile}
        <button
          type="button"
          class={["btn btn-ghost btn-sm", removing && "text-error"]}
          disabled={attempt.busy}
          onclick={removeProfile}
          onblur={() => {
            removing = false
          }}
        >
          <Icon icon="lucide:trash-2" class="size-4" />
          {removing
            ? m.harness_confirm_delete_profile()
            : m.harness_delete_profile()}
        </button>
      {/if}
    </header>

    {#if !harness.kind}
      <div class="grid flex-1 place-items-center p-6 text-center">
        <div class="flex flex-col items-center gap-2 text-sm text-base-content/60">
          <Icon icon="lucide:lock" class="size-6" />
          {m.harness_no_edit_long()}
        </div>
      </div>
    {:else if config}
      <div role="tablist" class="tabs tabs-border shrink-0">
        {#each config.docs as d (d.id)}
          <button
            type="button"
            role="tab"
            class={["tab", tab === d.id && "tab-active"]}
            aria-selected={tab === d.id}
            onclick={() => {
              tab = d.id
            }}
          >
            <Icon icon={DOC_ICONS[d.id] ?? "lucide:file"} class="me-2 size-4" />
            {docLabel(d)}
          </button>
        {/each}
        <button
          type="button"
          role="tab"
          class={["tab", tab === SKILLS && "tab-active"]}
          aria-selected={tab === SKILLS}
          onclick={() => {
            tab = SKILLS
          }}
        >
          <Icon icon="lucide:sparkles" class="me-2 size-4" />
          {m.harness_skills()}
          <span class="badge badge-ghost badge-xs ms-2 tabular-nums">
            {config.skills.length}
          </span>
        </button>
      </div>
      <div class="flex min-h-0 flex-1 flex-col pt-4">
        {#if tab === SKILLS}
          <SkillsTab
            skills={config.skills}
            onWrite={async (name, content) => {
              await host.writeSkill(harnessId, name, content)
              await reload()
            }}
            onRemove={async name => {
              await host.removeSkill(harnessId, name)
              await reload()
            }}
          />
        {:else if doc}
          {#key `${harnessId}:${doc.id}`}
            <DocEditor
              file={doc.file}
              content={doc.content}
              onSave={content => host.writeDoc(harnessId, doc.id, content)}
            />
          {/key}
        {/if}
      </div>
    {:else}
      <div class="grid flex-1 place-items-center">
        <span class="loading loading-spinner opacity-60"></span>
      </div>
    {/if}
    <ErrorAlert message={attempt.failure} />
  </div>

  <ProfileDialog
    open={profileOpen}
    {host}
    {harness}
    onCreated={(id, skipped) =>
      onSelect(
        id,
        skipped.length
          ? m.harness_skipped({ items: skipped.join(", ") })
          : undefined,
      )}
    onClose={() => {
      profileOpen = false
    }}
  />
{/if}
