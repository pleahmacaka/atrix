<script lang="ts">
  import Modal from "#lib/components/ui/Modal.svelte"
  import Segmented from "#lib/components/ui/Segmented.svelte"
  import { m } from "#lib/paraglide/messages.js"
  import { currentLocale } from "#lib/store/locale.ts"
  import { formatBytes } from "../../format"
  import { parentOf } from "../../locations"
  import {
    cancelSearch,
    randomToken,
    type Stat,
    statItems,
    type Tally,
    tallyDirs,
  } from "../../native"
  import { places } from "../../store/places.svelte"
  import {
    closeProperties,
    propertiesView,
  } from "../../store/properties.svelte"
  import ItemIcon from "../items/ItemIcon.svelte"
  import UsageView from "./UsageView.svelte"

  type View = "general" | "usage"

  const ATTRIBUTES: { bit: number; label: () => string; folder: boolean }[] = [
    { bit: 0x1, label: m.files_properties_readonly, folder: false },
    { bit: 0x2, label: m.files_properties_hidden, folder: true },
    { bit: 0x4, label: m.files_properties_system, folder: true },
    { bit: 0x800, label: m.files_properties_compressed, folder: true },
    { bit: 0x4000, label: m.files_properties_encrypted, folder: true },
  ]

  const VIEWS: { id: View; label: string }[] = [
    { id: "general", label: m.files_properties_general() },
    { id: "usage", label: m.files_properties_usage() },
  ]

  let stats = $state<Stat[]>([])
  let tally = $state<Tally | null>(null)
  let measuring = $state(false)
  let view = $state<View>("general")

  const paths = $derived(propertiesView.paths)
  const single = $derived(stats.length === 1 ? stats[0] : null)
  const drive = $derived(
    single ? places.drives.find(entry => entry.path === single.path) : undefined,
  )
  const locale = $derived(currentLocale())

  const dates = $derived(
    new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "medium" }),
  )

  const count = $derived(new Intl.NumberFormat(locale))

  const kinds = $derived(new Set(stats.map(stat => stat.kind)))

  const title = $derived(
    single
      ? single.name
      : m.files_properties_items({ count: count.format(paths.length) }),
  )

  const parent = $derived.by(() => {
    const found = new Set(paths.map(parentOf))

    return found.size === 1 ? [...found][0] : null
  })

  const bytes = $derived(
    stats.reduce((sum, stat) => sum + stat.size, 0) + (tally?.bytes ?? 0),
  )

  const flags = $derived(
    single
      ? ATTRIBUTES.filter(
          entry => single.attrs & entry.bit && (entry.folder || !single.dir),
        )
      : [],
  )

  const sized = (value: number) =>
    m.files_properties_bytes({
      size: formatBytes(value, locale),
      bytes: count.format(value),
    })

  $effect(() => {
    const requested = paths

    if (requested.length === 0) {
      return
    }

    let live = true
    const token = randomToken()

    stats = []
    tally = null
    measuring = false
    view = "general"

    statItems(requested)
      .then(found => {
        if (!live) {
          return
        }

        stats = found

        const folders = found
          .filter(
            stat =>
              stat.dir &&
              !places.drives.some(entry => entry.path === stat.path),
          )
          .map(stat => stat.path)

        if (folders.length > 0) {
          measuring = true
          tallyDirs(folders, token)
            .then(result => {
              if (live) {
                tally = result
              }
            })
            .catch(() => undefined)
            .finally(() => {
              if (live) {
                measuring = false
              }
            })
        }
      })
      .catch(() => undefined)

    return () => {
      live = false
      cancelSearch(token).catch(() => undefined)
    }
  })
</script>

{#snippet row(label: string, value: string)}
  <div class="flex min-w-0 gap-4 py-1.5">
    <dt class="w-28 shrink-0 text-base-content/60">{label}</dt>
    <dd class="min-w-0 flex-1 break-all select-text">{value}</dd>
  </div>
{/snippet}

<Modal
  bind:open={() => paths.length > 0, next => !next && closeProperties()}
  label={title}
  class={["w-full", view === "usage" ? "max-w-4xl" : "max-w-md"]}
>
  <div class="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
    <div class="flex min-w-0 items-center gap-3">
      <ItemIcon source={single?.path ?? paths[0] ?? ""} rem={2.5} />

      <div class="flex min-w-0 flex-1 flex-col">
        <h3 class="truncate text-sm font-semibold" {title}>{title}</h3>

        <span class="truncate text-sm text-base-content/60">
          {kinds.size === 1 ? [...kinds][0] : m.files_properties_mixed()}
        </span>
      </div>

      {#if single?.dir}
        <Segmented
          label={m.files_properties_usage()}
          items={VIEWS}
          value={view}
          onpick={next => (view = next)}
        />
      {/if}
    </div>

    {#if view === "usage" && single}
      <UsageView
        path={single.path}
        expected={drive ? drive.total - drive.free : 0}
      />
    {:else}
      <div
        class={[
          "flex flex-col rounded-box border border-base-300 bg-base-100 px-4 py-2",
          "text-sm tabular-nums",
        ]}
      >
        <dl class="flex flex-col">
        {#if parent && !drive}
          {@render row(m.files_properties_location(), parent)}
        {/if}

        {#if drive}
          {@render row(m.files_properties_used(), sized(drive.total - drive.free))}
          {@render row(m.files_properties_free(), sized(drive.free))}
          {@render row(m.files_properties_total(), sized(drive.total))}
        {:else}
          {@render row(
            m.files_properties_size(),
            measuring ? m.files_properties_measuring() : sized(bytes),
          )}

          {#if tally}
            {@render row(
              m.files_properties_contents(),
              m.files_properties_contents_value({
                files: count.format(tally.files),
                folders: count.format(tally.folders),
              }),
            )}
          {/if}
        {/if}

        {#if single}
          {#if single.created}
            {@render row(
              m.files_properties_created(),
              dates.format(single.created),
            )}
          {/if}

          {#if single.modified}
            {@render row(
              m.files_properties_modified(),
              dates.format(single.modified),
            )}
          {/if}

          {#if single.accessed}
            {@render row(
              m.files_properties_accessed(),
              dates.format(single.accessed),
            )}
          {/if}
        {/if}

        {#if flags.length > 0 || single?.link}
          <div class="flex min-w-0 gap-4 py-1.5">
            <dt class="w-28 shrink-0 text-base-content/60">
              {m.files_properties_attributes()}
            </dt>

            <dd class="flex min-w-0 flex-1 flex-wrap gap-1">
              {#each flags as flag (flag.bit)}
                <span class="badge badge-soft badge-sm">{flag.label()}</span>
              {/each}

              {#if single?.link}
                <span class="badge badge-soft badge-sm">
                  {m.files_properties_link()}
                </span>
              {/if}
            </dd>
          </div>
        {/if}
        </dl>

        {#if drive}
          <progress
            class="progress progress-primary my-2 w-full"
            value={drive.total - drive.free}
            max={drive.total}
            aria-label={m.files_properties_used()}
          ></progress>
        {/if}
      </div>
    {/if}

    <div class="flex justify-end">
      <button type="button" class="btn btn-sm" onclick={closeProperties}>
        {m.files_properties_close()}
      </button>
    </div>
  </div>
</Modal>
