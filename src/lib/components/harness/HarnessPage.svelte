<script lang="ts">
import Icon from "@iconify/svelte"
import { type Snippet, untrack } from "svelte"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ConfirmButton from "#lib/components/ui/ConfirmButton.svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import PageHeader from "#lib/components/ui/PageHeader.svelte"
import { failedNotice, removeProfileEverywhere } from "#lib/harness/profiles.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { ConfigDoc, HarnessConfig } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import { brandIcon } from "./brands.ts"
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
  top,
  extra,
}: {
  host: HostView
  harnessId: string
  onSelect: (id: string | null, notice?: string) => void
  top?: Snippet
  extra?: Snippet
} = $props()

const attempt = new Attempt()

let config = $state<HarnessConfig | null>(null)

let tab = $state("instructions")

let profileOpen = $state(false)

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

const removeProfile = () =>
  attempt.run(async () => {
    await (harness ? removeProfileEverywhere(harness) : host.removeProfile(harnessId))
    onSelect(null)
  })
</script>

{#snippet tabButton(id: string, icon: string, label: string, count?: number)}
  <button
    type="button"
    role="tab"
    class={["tab shrink-0 flex-nowrap whitespace-nowrap", tab === id && "tab-active"]}
    aria-selected={tab === id}
    onclick={() => {
      tab = id
    }}
  >
    <Icon {icon} class="me-2 size-4 shrink-0" />
    {label}
    {#if count !== undefined}
      <span class="badge badge-ghost badge-xs ms-2 tabular-nums">{count}</span>
    {/if}
  </button>
{/snippet}

{#if harness}
  <div class="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
    <PageHeader
      icon={brandIcon(harness.base)}
      title={harness.profile ?? harness.name}
    >
      {#snippet actions()}
        <span
          class="flex items-center gap-1 text-xs whitespace-nowrap text-base-content/55 max-sm:hidden"
        >
          <Icon
            icon={harness.profile ? "lucide:git-fork" : "lucide:globe"}
            class="size-3"
          />
          {harness.profile ? m.harness_profile() : m.harness_global()}
        </span>
        {#if harness.kind && !harness.profile}
          <IconButton
            icon="lucide:git-fork"
            label={m.harness_new_profile()}
            onclick={() => {
              profileOpen = true
            }}
          />
        {/if}
        {#if harness.profile}
          <ConfirmButton
            label={m.harness_delete_profile()}
            disabled={attempt.busy}
            onconfirm={removeProfile}
          />
        {/if}
        {@render extra?.()}
      {/snippet}
    </PageHeader>
    {@render top?.()}

    <div class="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6">
      {#if config?.dir}
        <p
          class="flex min-w-0 items-center gap-1 pb-2 text-xs text-base-content/60"
          title={config.dir}
        >
          <Icon icon="lucide:folder" class="size-3 shrink-0" />
          <span class="min-w-0 truncate">{config.dir}</span>
        </p>
      {/if}

      {#if !harness.kind}
        <EmptyState centered icon="lucide:lock" text={m.harness_no_edit_long()} />
      {:else if config}
        <div
          role="tablist"
          class={[
            "tabs tabs-border shrink-0 flex-nowrap overflow-x-auto",
            "scrollbar-none",
          ]}
        >
          {#each config.docs as d (d.id)}
            {@render tabButton(
              d.id,
              DOC_ICONS[d.id] ?? "lucide:file",
              docLabel(d),
            )}
          {/each}
          {@render tabButton(
            SKILLS,
            "lucide:sparkles",
            m.harness_skills(),
            config.skills.length,
          )}
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
      {:else if !attempt.failure}
        <div class="grid flex-1 place-items-center">
          <span class="loading loading-spinner opacity-60"></span>
        </div>
      {/if}
      <ErrorAlert message={attempt.failure} />
    </div>
  </div>

  <ProfileDialog
    open={profileOpen}
    {host}
    {harness}
    onCreated={(id, skipped, failed) =>
      onSelect(
        id,
        [
          skipped.length ? m.harness_skipped({ items: skipped.join(", ") }) : null,
          failedNotice(failed),
        ]
          .filter(Boolean)
          .join(" ") || undefined,
      )}
    onClose={() => {
      profileOpen = false
    }}
  />
{/if}
