<script lang="ts">
import Icon from "@iconify/svelte"
import type { Tile } from "#lib/apps/app.ts"
import { apps } from "#lib/apps/apps.svelte.ts"
import {
  type Drop,
  dissolveFolder,
  moveTile,
  releaseMember,
  renameFolder,
  type Source,
  sourceSchema,
} from "#lib/apps/home.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import { knowledgeHost } from "#lib/knowledge/host.ts"
import { m } from "#lib/paraglide/messages.js"
import { contextMenu, type MenuItem } from "#lib/store/contextMenu.svelte.ts"
import AppView from "./AppView.svelte"

const DRAG_TYPE = "application/x-atrix-app"

const EDGE = 0.3

const attempt = new Attempt()

const host = $derived(knowledgeHost())

const ready = $derived(!!host?.state?.knowledge?.ready)

let opened = $state<string | null>(null)

let folderId = $state<string | null>(null)

let hint = $state<{ index: number; drop: Drop } | null>(null)

let renaming = $state<{ id: string; value: string } | null>(null)

let dialog = $state<HTMLDialogElement>()

const folder = $derived(
  apps.home.tiles.find(
    (t): t is Extract<Tile, { kind: "folder" }> =>
      t.kind === "folder" && t.id === folderId,
  ) ?? null,
)

$effect(() => {
  if (folder && !dialog?.open) {
    dialog?.showModal()
  } else if (!folder && dialog?.open) {
    dialog.close()
  }
})

$effect(() => {
  if (ready && host) {
    void host.apps.length
    attempt.run(apps.load)
  }
})

const arrange = (tiles: Tile[]) => attempt.run(() => apps.arrangeTiles(tiles))

const dropOf = (e: DragEvent & { currentTarget: HTMLElement }): Drop => {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width

  return x < EDGE ? "before" : x > 1 - EDGE ? "after" : "merge"
}

const sourceOf = (e: DragEvent): Source | null => {
  const raw = e.dataTransfer?.getData(DRAG_TYPE)

  if (!raw) {
    return null
  }

  try {
    return sourceSchema.safeParse(JSON.parse(raw)).data ?? null
  } catch {
    return null
  }
}

const startDrag = (e: DragEvent, source: Source) => {
  e.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(source))

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move"
  }
}

const dropOn = (e: DragEvent, index: number) => {
  const source = sourceOf(e)
  const drop = hint?.drop ?? "before"

  hint = null

  if (source) {
    e.preventDefault()
    arrange(moveTile(apps.home.tiles, source, index, drop, m.apps_folder_default()))
  }
}

const titleOf = (key: string) => apps.byKey[key]?.title ?? key

const iconOf = (key: string) => apps.byKey[key]?.icon ?? "lucide:app-window"

const appMenu = (key: string, inFolder: string | null): MenuItem[] => [
  {
    label: m.menu_open(),
    icon: "lucide:app-window",
    run: () => {
      opened = key
    },
  },
  {
    label: m.menu_rename(),
    icon: "lucide:pencil",
    run: () => {
      renaming = { id: key, value: titleOf(key) }
    },
  },
  ...(inFolder
    ? [
        {
          label: m.apps_release(),
          icon: "lucide:folder-output",
          run: () => arrange(releaseMember(apps.home.tiles, inFolder, key)),
        },
      ]
    : []),
  "separator",
  {
    label: m.common_delete(),
    icon: "lucide:trash-2",
    danger: true,
    confirm: m.menu_confirm_delete(),
    run: () => attempt.run(() => apps.remove(key)),
  },
]

const folderMenu = (id: string, name: string): MenuItem[] => [
  {
    label: m.menu_open(),
    icon: "lucide:folder-open",
    run: () => {
      folderId = id
    },
  },
  {
    label: m.menu_rename(),
    icon: "lucide:pencil",
    run: () => {
      renaming = { id, value: name }
    },
  },
  {
    label: m.apps_dissolve(),
    icon: "lucide:ungroup",
    run: () => arrange(dissolveFolder(apps.home.tiles, id)),
  },
]

const commitRename = () => {
  const current = renaming

  renaming = null

  if (!current) {
    return
  }

  if (apps.byKey[current.id]) {
    attempt.run(() => apps.rename(current.id, current.value))
  } else {
    arrange(renameFolder(apps.home.tiles, current.id, current.value))
  }
}
</script>

{#snippet name(id: string, title: string)}
  {#if renaming?.id === id}
    <input
      class="input input-xs w-24 text-center"
      aria-label={m.menu_rename()}
      bind:value={renaming.value}
      onkeydown={e => {
        if (e.key === "Enter") {
          commitRename()
        } else if (e.key === "Escape") {
          e.preventDefault()
          renaming = null
        }
      }}
      onblur={commitRename}
      {@attach node => node.focus()}
    />
  {:else}
    <span class="w-24 truncate text-center text-xs">{title}</span>
  {/if}
{/snippet}

{#snippet face(icon: string, title: string, id: string)}
  <span
    class={[
      "grid size-16 place-items-center squircle border border-base-300 bg-raised",
      "shadow-sm transition-transform group-hover/tile:-translate-y-0.5",
    ]}
  >
    <Icon {icon} class="size-7 text-primary" />
  </span>
  {@render name(id, title)}
{/snippet}

{#snippet folderFace(tile: Extract<Tile, { kind: "folder" }>)}
  <span
    class={[
      "grid size-16 grid-cols-2 grid-rows-2 gap-1 squircle border border-base-300 bg-raised p-2",
      "shadow-sm transition-transform group-hover/tile:-translate-y-0.5",
    ]}
  >
    {#each tile.apps.slice(0, 4) as key (key)}
      <span class="grid place-items-center rounded-field bg-inset">
        <Icon icon={iconOf(key)} class="size-3.5 text-primary" />
      </span>
    {/each}
  </span>
  {@render name(tile.id, tile.name)}
{/snippet}

<div class="@container relative flex min-h-0 flex-1 flex-col">
  {#if opened}
    <AppView appKey={opened} onclose={() => (opened = null)} />
  {:else if !ready}
    <EmptyState icon="lucide:database" text={m.apps_store_unavailable()} centered />
  {:else if apps.home.tiles.length === 0}
    <EmptyState icon="lucide:layout-grid" text={m.apps_empty()} centered />
  {:else}
    <ul
      class={[
        "grid content-start grid-cols-3 gap-x-2 gap-y-6 overflow-y-auto p-4 @md:p-8",
        "@md:grid-cols-5 @2xl:grid-cols-7 @5xl:grid-cols-9",
      ]}
      aria-label={m.apps_title()}
    >
      {#each apps.home.tiles as tile, index (tile.kind === "app" ? tile.key : tile.id)}
        <li
          class="relative grid place-items-center"
          ondragover={e => {
            if (e.dataTransfer?.types.includes(DRAG_TYPE)) {
              e.preventDefault()
              hint = { index, drop: dropOf(e) }
            }
          }}
          ondragleave={e => {
            if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) {
              hint = null
            }
          }}
          ondrop={e => dropOn(e, index)}
        >
          {#if hint?.index === index && hint.drop !== "merge"}
            <span
              class={[
                "pointer-events-none absolute inset-y-2 w-1 rounded-full bg-primary",
                hint.drop === "before" ? "-left-1" : "-right-1",
              ]}
            ></span>
          {/if}
          <button
            type="button"
            draggable="true"
            class={[
              "group/tile flex cursor-pointer flex-col items-center gap-1.5 rounded-box p-1",
              "active:cursor-grabbing",
              hint?.index === index && hint.drop === "merge" && "ring-2 ring-primary",
            ]}
            title={tile.kind === "app" ? titleOf(tile.key) : tile.name}
            ondragstart={e => startDrag(e, { kind: "tile", index })}
            ondragend={() => (hint = null)}
            onclick={() => {
              if (tile.kind === "app") {
                opened = tile.key
              } else {
                folderId = tile.id
              }
            }}
            oncontextmenu={e =>
              contextMenu.show(
                e,
                tile.kind === "app"
                  ? appMenu(tile.key, null)
                  : folderMenu(tile.id, tile.name),
              )}
          >
            {#if tile.kind === "app"}
              {@render face(iconOf(tile.key), titleOf(tile.key), tile.key)}
            {:else}
              {@render folderFace(tile)}
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <dialog
    bind:this={dialog}
    class="modal"
    aria-label={folder?.name}
    onclose={() => {
      folderId = null
      contextMenu.close()
    }}
  >
    {#if folder}
      <section
        class={[
          "modal-box flex max-w-md flex-col gap-4 p-5",
          "rounded-box border border-base-300",
        ]}
      >
        <h2 class="truncate text-center text-sm font-semibold">{folder.name}</h2>
        <ul class="grid grid-cols-3 gap-x-2 gap-y-5">
          {#each folder.apps as key (key)}
            <li class="grid place-items-center">
              <button
                type="button"
                draggable="true"
                class={[
                  "group/tile flex cursor-pointer flex-col items-center gap-1.5 rounded-box p-1",
                  "active:cursor-grabbing",
                ]}
                title={titleOf(key)}
                ondragstart={e =>
                  startDrag(e, { kind: "member", folder: folder.id, key })}
                onclick={() => {
                  opened = key
                  folderId = null
                }}
                oncontextmenu={e => contextMenu.show(e, appMenu(key, folder.id))}
              >
                {@render face(iconOf(key), titleOf(key), key)}
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
    <form method="dialog" class="modal-backdrop">
      <button
        type="submit"
        class="cursor-default"
        aria-label={m.common_close()}
        ondragover={e => {
          if (e.dataTransfer?.types.includes(DRAG_TYPE)) {
            e.preventDefault()
          }
        }}
        ondrop={e => {
          const source = sourceOf(e)

          if (source?.kind === "member") {
            e.preventDefault()
            arrange(releaseMember(apps.home.tiles, source.folder, source.key))
          }
        }}
      ></button>
    </form>
  </dialog>

  <ErrorAlert message={attempt.failure} />
</div>
