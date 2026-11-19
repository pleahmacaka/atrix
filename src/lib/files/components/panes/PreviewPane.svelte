<script lang="ts">
import { untrack } from "svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { docKind } from "#lib/doc-preview/index.ts"
import { m } from "#lib/paraglide/messages.js"
import { currentLocale } from "#lib/store/locale.ts"
import { type FileKind, kindOf } from "../../filetypes"
import { formatBytes, formatDate } from "../../format"
import { fromArchive, fromListing, type Item, packedEntry } from "../../items"
import { isVirtual, parentOf } from "../../locations"
import {
  allowPreview,
  assetUrl,
  extractEntry,
  inspectTensors,
  listDir,
  previewText,
  type Tensors,
} from "../../native"
import { archiveListing, isArchive } from "../../store/archive.svelte"
import { prefs } from "../../store/prefs.svelte"
import { confirmPrivate } from "../../store/privacy.svelte"
import type { Tab } from "../../store/tab.svelte"
import ItemIcon from "../items/ItemIcon.svelte"
import ResizeHandle from "../window/ResizeHandle.svelte"
import DocumentPeek from "./DocumentPeek.svelte"
import FolderPane from "./FolderPane.svelte"
import FolderPeek from "./FolderPeek.svelte"
import HexView from "./HexView.svelte"
import TensorPeek from "./TensorPeek.svelte"
import ZoomImage from "./ZoomImage.svelte"

type FileView = Exclude<FileKind, "model"> | "document"

type Content =
  | { kind: null }
  | { kind: "folder" | "archive"; children: Item[] }
  | { kind: "text"; text: string }
  | { kind: "hex" }
  | { kind: "tensors"; tensors: Tensors }
  | { kind: Exclude<FileView, "text" | "tensors">; url: string }

type Shown = Content & { key: string; source?: string }

const NOTHING: Content = { kind: null }

const DEFAULT_WIDTH = 20

let { item, tab }: { item: Item | null; tab: Tab } = $props()

let shown = $state.raw<Shown | null>(null)

let hexView = $state(false)

const version = $derived(
  item ? `${item.key}\0${item.modified}\0${item.size}` : null,
)

const previewKind = (target: Item): FileView | null => {
  if (docKind(target.name)) {
    return "document"
  }

  const kind = kindOf(target.name)

  return kind === "model" ? "text" : kind
}

const children = async (target: Item) => {
  if (target.packed) {
    const listing = await archiveListing(target.packed, false)

    return fromArchive(target.path, target.packed, packedEntry(target), listing)
  }

  if (target.dir) {
    return fromListing(await listDir(target.path))
  }

  return fromArchive(
    target.path,
    target.path,
    "",
    await archiveListing(target.path, false),
  )
}

const load = async (target: Item): Promise<Content & { source?: string }> => {
  if (!(await confirmPrivate(target.path, parentOf(target.path) ?? ""))) {
    return NOTHING
  }

  if (target.dir || (!target.packed && isArchive(target.name))) {
    return {
      kind: target.dir ? "folder" : "archive",
      children: await children(target),
    }
  }

  const kind = previewKind(target)
  const path = target.packed
    ? await extractEntry(target.packed, packedEntry(target))
    : target.path
  const hex = { kind: "hex" as const, source: path }

  if (!kind) {
    return target.size > 0 ? hex : NOTHING
  }

  if (kind === "text") {
    const text = await previewText(path).catch(() => "")

    return text
      ? { kind, text, source: path }
      : target.size > 0
        ? hex
        : NOTHING
  }

  if (kind === "tensors") {
    const tensors = await inspectTensors(path).catch(() => null)

    return tensors ? { kind, tensors, source: path } : hex
  }

  await allowPreview(path)

  return { kind, url: assetUrl(path), source: path }
}

$effect(() => {
  const target = version ? untrack(() => item) : null

  hexView = false

  if (!target || isVirtual(target.path)) {
    shown = null

    return
  }

  let live = true

  load(target)
    .catch(() => NOTHING)
    .then(content => {
      if (live) {
        shown = { ...content, key: target.key }
      }
    })

  return () => {
    live = false
  }
})

const current = $derived(
  shown && item && shown.key === item.key ? shown : null,
)

const facts = $derived(
  item
    ? [
        { label: m.files_columns_kind(), value: item.kind },
        {
          label: m.files_columns_size(),
          value: item.dir ? "" : formatBytes(item.size, currentLocale()),
        },
        {
          label: m.files_columns_modified(),
          value: formatDate(item.modified, currentLocale()),
        },
      ].filter(fact => fact.value)
    : [],
)
</script>

<ResizeHandle
  resize={{
    axis: "x",
    invert: true,
    min: 14,
    max: 40,
    get: () => prefs.previewWidth,
    set: width => (prefs.previewWidth = width),
  }}
  label={m.shell_resize_pane()}
  onreset={() => (prefs.previewWidth = DEFAULT_WIDTH)}
/>

<aside
  class="island flex shrink-0 flex-col gap-3 overflow-hidden p-2"
  style:width="{prefs.previewWidth}rem"
>
  {#if !item}
    <FolderPane {tab} />
  {:else}
    <div
      class={[
        "relative flex min-h-0 grow items-center justify-center",
        "overflow-hidden rounded-field bg-inset",
      ]}
    >
      {#if current?.source && current.kind !== "hex"}
        <IconButton
          icon="lucide:binary"
          label={m.files_hex_toggle()}
          size="xs"
          iconClass="size-3.5"
          aria-pressed={hexView}
          class={[
            "absolute top-1.5 right-1.5 z-10 bg-raised shadow-sm",
            hexView && "text-primary",
          ]}
          onclick={() => (hexView = !hexView)}
        />
      {/if}

      {#if current?.source && (current.kind === "hex" || hexView)}
        {#key current.source}
          <HexView path={current.source} size={item.size} />
        {/key}
      {:else if current?.kind === "folder" || current?.kind === "archive"}
        <FolderPeek
          items={current.children}
          label={(current.kind === "folder"
            ? m.files_peek_items
            : m.files_peek_archive)({ count: current.children.length })}
        />
      {:else if current?.kind === "tensors"}
        <TensorPeek tensors={current.tensors} />
      {:else if current?.kind === "document"}
        <DocumentPeek url={current.url} name={item.name} />
      {:else if current?.kind === "image"}
        {#key current.url}
          <ZoomImage src={current.url} alt={item.name} />
        {/key}
      {:else if current?.kind === "video"}
        <video src={current.url} controls class="max-h-full max-w-full">
          <track kind="captions" />
        </video>
      {:else if current?.kind === "audio"}
        <audio src={current.url} controls class="w-full px-2">
          <track kind="captions" />
        </audio>
      {:else if current?.kind === "pdf"}
        <iframe src={current.url} title={item.name} class="size-full border-0"
        ></iframe>
      {:else if current?.kind === "text"}
        <pre
          class={[
            "size-full overflow-auto p-3 font-sans text-xs leading-relaxed",
            "break-words whitespace-pre-wrap select-text",
          ]}>{current.text}</pre>
      {:else}
        <div
          class={[
            "flex flex-col items-center gap-3 px-4",
            "text-sm text-base-content/60",
          ]}
        >
          <ItemIcon source={item} rem={6} thumbnail class="size-24" />
          {#if current}
            {m.files_states_no_preview()}
          {/if}
        </div>
      {/if}
    </div>

    <div class="flex shrink-0 flex-col gap-1 px-1 pb-1 text-xs">
      <span class="truncate text-sm font-medium" title={item.name}>
        {item.name}
      </span>
      {#each facts as fact (fact.label)}
        <div class="flex min-w-0 justify-between gap-3">
          <span class="shrink-0 text-base-content/55">{fact.label}</span>
          <span class="min-w-0 truncate tabular-nums" title={fact.value}>
            {fact.value}
          </span>
        </div>
      {/each}
    </div>
  {/if}
</aside>
