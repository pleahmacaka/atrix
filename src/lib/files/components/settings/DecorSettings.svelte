<script lang="ts">
  import Section from "#lib/components/ui/Section.svelte"
  import Select from "#lib/components/ui/Select.svelte"
  import SettingRow from "#lib/components/ui/SettingRow.svelte"
  import { m } from "#lib/paraglide/messages.js"
  import type { GitHead } from "../../native"
  import { CLEANUP_HOURS, enableCleanup } from "../../store/cleanup.svelte"
  import {
    type CleanupColor,
    prefs,
    type RepoPart,
  } from "../../store/prefs.svelte"
  import CleanupBadge from "../items/CleanupBadge.svelte"
  import { CLEANUP_COLORS } from "../items/decor"
  import RepoChip from "../items/RepoChip.svelte"
  import GitHostSettings from "./GitHostSettings.svelte"
  import OrderList from "./OrderList.svelte"

  const TOGGLES: {
    key: "duplicates" | "gitColors" | "emptyFolders"
    label: () => string
  }[] = [
    { key: "duplicates", label: m.files_settings_decor_duplicates },
    { key: "gitColors", label: m.files_settings_decor_git_colors },
    { key: "emptyFolders", label: m.files_settings_decor_empty_folders },
  ]

  const SAMPLE: GitHead = {
    branch: "main",
    remotes: [
      { name: "origin", url: "https://github.com/octocat/hello-world" },
      { name: "upstream", url: "https://github.com/github/hello-world" },
    ],
  }

  const PARTS: Record<RepoPart, { icon: string; label: () => string }> = {
    logo: {
      icon: "simple-icons:github",
      label: m.files_settings_repo_chip_parts_logo,
    },
    host: { icon: "lucide:globe", label: m.files_settings_repo_chip_parts_host },
    repo: {
      icon: "lucide:book-marked",
      label: m.files_settings_repo_chip_parts_repo,
    },
    branch: {
      icon: "lucide:git-branch",
      label: m.files_settings_repo_chip_parts_branch,
    },
    fork: { icon: "lucide:git-fork", label: m.files_settings_repo_chip_parts_fork },
  }

  const COLOR_LABELS: Record<CleanupColor, () => string> = {
    orange: m.files_settings_cleanup_colors_orange,
    amber: m.files_settings_cleanup_colors_amber,
    red: m.files_settings_cleanup_colors_red,
    primary: m.files_settings_cleanup_colors_primary,
  }
</script>

<Section>
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

<Section title={m.files_settings_repo_chip_title()}>
  {#snippet actions()}
    <span class="flex min-w-0" inert>
      <RepoChip kind="repo" head={SAMPLE} />
    </span>
  {/snippet}

  <OrderList
    bind:arrangement={prefs.repoChip}
    label={m.files_settings_repo_chip_title()}
    labelOf={id => PARTS[id].label()}
    iconOf={id => PARTS[id].icon}
  />
</Section>

<GitHostSettings />

<Section title={m.files_settings_cleanup_title()}>
  <SettingRow title={m.files_settings_cleanup_enabled()}>
    <input
      type="checkbox"
      class="toggle toggle-sm toggle-primary"
      aria-label={m.files_settings_cleanup_enabled()}
      checked={prefs.cleanup}
      onchange={e => enableCleanup(e.currentTarget.checked)}
    />
  </SettingRow>

  {#if prefs.cleanup}
    <SettingRow title={m.files_settings_cleanup_hours()}>
      <Select
        class="w-32 max-sm:w-full"
        label={m.files_settings_cleanup_hours()}
        options={CLEANUP_HOURS.map(hours => ({
          value: hours,
          label: m.files_settings_cleanup_hours_value({ hours }),
        }))}
        bind:value={prefs.cleanupHours}
      />
    </SettingRow>

    <SettingRow title={m.files_settings_cleanup_color()}>
      <CleanupBadge hours={prefs.cleanupHours} />

      <fieldset
        aria-label={m.files_settings_cleanup_color()}
        class="flex items-center gap-2"
      >
        {#each CLEANUP_COLORS as color (color.id)}
          {@const selected = prefs.cleanupColor === color.id}
          {@const label = COLOR_LABELS[color.id]()}

          <button
            type="button"
            aria-pressed={selected}
            aria-label={label}
            title={label}
            class={[
              "size-6 cursor-pointer rounded-full ring-offset-2 ring-offset-base-100",
              "transition duration-140",
              color.swatch,
              selected ? "ring-2 ring-base-content/60" : "opacity-70 hover:opacity-100",
            ]}
            onclick={() => (prefs.cleanupColor = color.id)}
          ></button>
        {/each}
      </fieldset>
    </SettingRow>
  {/if}
</Section>
