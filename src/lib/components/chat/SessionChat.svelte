<script lang="ts">
import Icon from "@iconify/svelte"
import {
  type ChatItem,
  splitContext,
  type ThoughtItem,
  type ToolItem,
} from "#lib/acp/items.ts"
import { toAttachment } from "#lib/chat/attachments.ts"
import IconSelect from "#lib/components/ui/IconSelect.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import type { ConfigChoice } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import PcbSide from "#lib/pcb/PcbSide.svelte"
import { contextMenu } from "#lib/store/contextMenu.svelte.ts"
import Attachments from "./Attachments.svelte"
import Composer from "./Composer.svelte"
import CopyButton from "./CopyButton.svelte"
import Markdown from "./Markdown.svelte"
import PlanCard from "./PlanCard.svelte"
import ToolGroup from "./ToolGroup.svelte"

let { host, sessionId }: { host: HostView; sessionId: string } = $props()

const uid = $props.id()

const view = $derived(host.views[sessionId])

const elsewhere = $derived(
  !!view?.external &&
    !!host.state?.external.some(e => e.id === sessionId),
)

let failure = $state<string | null>(null)

const attempt = async (work: () => Promise<unknown>) => {
  failure = null

  try {
    await work()
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e)
  }
}

type Activity = ToolItem | ThoughtItem

type Segment =
  | { kind: "activity"; key: string; items: Activity[] }
  | { kind: "item"; key: string; item: ChatItem }

const isActivity = (item: ChatItem): item is Activity =>
  item.type === "tool" || item.type === "thought"

const segments = $derived(
  (view?.items ?? []).reduce<Segment[]>((all, item) => {
    const last = all.at(-1)

    if (isActivity(item) && last?.kind === "activity") {
      last.items.push(item)
    } else if (isActivity(item)) {
      all.push({ kind: "activity", key: item.id, items: [item] })
    } else {
      all.push({ kind: "item", key: item.id, item })
    }

    return all
  }, []),
)

const copyMenu = (e: MouseEvent, text: string) => {
  if (getSelection()?.toString()) {
    return
  }

  contextMenu.show(e, [
    {
      label: m.menu_copy_message(),
      icon: "lucide:copy",
      run: () => navigator.clipboard.writeText(text),
    },
  ])
}

const PRIMARY = ["mode", "model", "thought_level"]

const OPTION_ICONS: Record<string, string> = {
  mode: "lucide:shield-check",
  model: "lucide:cpu",
  thought_level: "lucide:brain",
}

const isPrimary = (option: ConfigChoice) =>
  PRIMARY.includes(option.category ?? "")

const folder = (cwd: string) =>
  cwd.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? cwd
</script>

{#snippet picker(option: ConfigChoice, ghost: boolean)}
  <IconSelect
    icon={OPTION_ICONS[option.category ?? ""] ?? "lucide:settings-2"}
    label={option.name}
    {ghost}
    value={option.current}
    choices={option.values.map(v => ({ value: v.value, name: v.name }))}
    disabled={view?.running}
    onchange={value =>
      attempt(() => host.configure(sessionId, option.id, value))}
  />
{/snippet}

{#if view}
  <div class="flex min-h-0 flex-1">
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="scroll-centered flex min-h-0 flex-1 flex-col-reverse overflow-y-auto">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        {#each segments as segment (segment.key)}
          {#if segment.kind === "activity"}
            <ToolGroup items={segment.items} />
          {:else if segment.item.type === "user"}
            {@const item = segment.item}
            {@const split = splitContext(item.text)}
            {@const files = [
              ...(item.files ?? []),
              ...split.files.filter(f => !item.files?.some(g => g.name === f.name)),
            ]}
            {#if files.length}
              <Attachments {files} mine />
            {/if}
            {#if split.text}
              <div
                class={[
                  "max-w-xl min-w-0 self-end rounded-box bg-base-200 px-4 py-2",
                  "break-keep whitespace-pre-wrap wrap-anywhere",
                ]}
              >
                {split.text}
              </div>
            {/if}
          {:else if segment.item.type === "agent"}
            {@const item = segment.item}
            <article
              class="group flex flex-col gap-1"
              oncontextmenu={e => copyMenu(e, item.text)}
            >
              <Markdown text={item.text} />
              <div class="transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                <CopyButton text={item.text} />
              </div>
            </article>
          {:else if segment.item.type === "plan"}
            <PlanCard entries={segment.item.entries} />
          {/if}
        {/each}
        {#if view.running && !view.ask}
          <span class="loading loading-dots loading-sm opacity-60"></span>
        {/if}
        {#if view.ask}
          <div class="rounded-box border border-warning p-3">
            <p class="mb-2 flex items-center gap-2 text-sm font-medium">
              <Icon icon="lucide:shield-alert" class="size-4 shrink-0 text-warning" />
              <span class="min-w-0">{m.chat_permission({ title: view.ask.title })}</span>
            </p>
            <div class="flex flex-wrap gap-2">
              {#each view.ask.options as option (option.optionId)}
                <button
                  type="button"
                  class={[
                    "btn btn-sm",
                    option.kind.startsWith("allow") ? "btn-primary" : "btn-ghost",
                  ]}
                  onclick={() =>
                    attempt(() => host.permit(sessionId, option.optionId))}
                >
                  <Icon
                    icon={option.kind.startsWith("allow")
                      ? option.kind.endsWith("always")
                        ? "lucide:check-check"
                        : "lucide:check"
                      : "lucide:x"}
                    class="size-4"
                  />
                  {option.name}
                </button>
              {/each}
            </div>
          </div>
        {/if}
        {#if failure}
          <div role="alert" class="alert alert-error alert-soft text-sm">
            {failure}
          </div>
        {/if}
      </div>
    </div>
    <Composer
      busy={view.running && !elsewhere}
      placeholder={elsewhere
        ? m.chat_external_queue()
        : m.chat_harness_placeholder()}
      onSend={(text, files) =>
        attempt(async () =>
          host.prompt(
            sessionId,
            text,
            await Promise.all(files.map(toAttachment)),
          ),
        )}
      onStop={() => attempt(() => host.cancel(sessionId))}
    >
      {#snippet tools()}
        <span
          class="inline-flex h-8 items-center gap-1.5 rounded-field px-2 text-sm whitespace-nowrap"
          title={view.cwd}
        >
          <Icon icon="lucide:folder" class="size-4 opacity-60" />
          {folder(view.cwd)}
        </span>
        {#each view.config.filter(isPrimary) as option (option.id)}
          {@render picker(option, true)}
        {/each}
        {#if view.config.some(o => !isPrimary(o))}
          <div>
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-square"
              aria-label={m.chat_options()}
              title={m.chat_options()}
              popovertarget="{uid}-options"
              style:anchor-name="--{uid}-options"
            >
              <Icon icon="lucide:sliders-horizontal" class="size-4" />
            </button>
            <div
              id="{uid}-options"
              popover="auto"
              style:position-anchor="--{uid}-options"
              class={[
                "options popover-box fixed inset-auto m-0 my-2 hidden w-80 flex-col",
                "open:flex",
                "gap-3 p-4 text-base-content",
              ]}
            >
              {#each view.config.filter(o => !isPrimary(o)) as option (option.id)}
                <div class="flex items-center gap-3 text-sm">
                  <span class="min-w-0 flex-1 truncate" title={option.name}>
                    {option.name}
                  </span>
                  {@render picker(option, false)}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/snippet}
    </Composer>
  </div>
  <PcbSide cwd={view.cwd} />
  </div>
{:else}
  <div class="grid flex-1 place-items-center">
    <span class="loading loading-spinner opacity-60"></span>
  </div>
{/if}

<style>
  .options {
    position-area: block-start span-inline-end;
    position-try-fallbacks: flip-block, flip-inline;
  }
</style>
