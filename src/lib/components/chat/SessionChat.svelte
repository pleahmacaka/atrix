<script lang="ts">
import { untrack } from "svelte"
import { appTitleOf } from "#lib/apps/app.ts"
import { apps } from "#lib/apps/apps.svelte.ts"
import { toAttachment } from "#lib/chat/attachments.ts"
import type { Block } from "#lib/chat/blocks.ts"
import { sendPrimed } from "#lib/chat/primer.ts"
import { drainFailures } from "#lib/chat/queue.svelte.ts"
import { quoteInto } from "#lib/chat/quote.ts"
import { pinToggles, stickBottom } from "#lib/chat/scroll.ts"
import { hasTimeline, segmentsOf, turnsOf } from "#lib/chat/session.ts"
import { openThread, startThread, threadsOf } from "#lib/chat/threads.svelte.ts"
import { Attempt } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { isGoneError } from "#lib/p2p/protocol.ts"
import { m } from "#lib/paraglide/messages.js"
import PcbSide from "#lib/pcb/PcbSide.svelte"
import { openConversation } from "#lib/store/nav.svelte.ts"
import { panes, usePane } from "#lib/store/panes.svelte.ts"
import { describe } from "#lib/store/recent.ts"
import { conversation } from "#lib/voice/conversation.svelte.ts"
import AgentReply from "./AgentReply.svelte"
import ChatCorner from "./ChatCorner.svelte"
import ChatTimeline from "./ChatTimeline.svelte"
import Composer from "./Composer.svelte"
import PermissionCard from "./PermissionCard.svelte"
import QuestionCard from "./QuestionCard.svelte"
import QueuedPrompts from "./QueuedPrompts.svelte"
import RunningStatus from "./RunningStatus.svelte"
import SessionExtras from "./SessionExtras.svelte"
import SessionTools from "./SessionTools.svelte"
import SidePanel from "./SidePanel.svelte"
import TerminalDialog from "./TerminalDialog.svelte"
import ThoughtNote from "./ThoughtNote.svelte"
import ToolGroup from "./ToolGroup.svelte"
import UiBlocks from "./UiBlocks.svelte"
import UserPrompt from "./UserPrompt.svelte"
import VoiceConversation from "./VoiceConversation.svelte"

let { host, sessionId }: { host: HostView; sessionId: string } = $props()

const pane = usePane()

const tries = new Attempt()

const attempt = tries.run

$effect(() => {
  void sessionId
  tries.failure = null
})

const view = $derived(host.views[sessionId])

const elsewhere = $derived(host.elsewhere(sessionId))

const talking = $derived(conversation.owner === sessionId)

$effect(() => {
  if (!talking) {
    return
  }

  untrack(() => conversation.shown++)

  return () => {
    conversation.shown--
  }
})

const segments = $derived(segmentsOf(view?.items ?? []))

const turns = $derived(turnsOf(view?.items ?? []))

const queued = $derived(view?.queued ?? [])

const agents = $derived(
  view?.agents?.length
    ? view.agents
    : (host.state?.open
        .find(s => s.id === sessionId)
        ?.subagents.map(a => ({ ...a, step: "" })) ?? []),
)

const plan = $derived(
  view?.items.findLast(i => i.type === "plan")?.entries ?? [],
)

const cornered = $derived(plan.length > 0 || (view?.agents?.length ?? 0) > 0)

let scroller = $state<HTMLElement>()

const send = (text: string, files: File[] = []) =>
  attempt(async () => {
    const attachments = await Promise.all(files.map(toAttachment))

    try {
      await sendPrimed(sessionId, text, primed =>
        host.prompt(sessionId, primed, attachments),
      )
    } catch (e) {
      if (!isGoneError(e) || !view) {
        throw e
      }

      const id = await host.create(view.harness, view.cwd)

      const next = { kind: "session" as const, host: host.id, id }

      if (pane) {
        panes.open(next, pane())
      } else {
        openConversation(next)
      }

      await sendPrimed(sessionId, text, primed =>
        host.prompt(id, primed, attachments),
      )
    }
  })

const reply = (text: string) =>
  attempt(() =>
    sendPrimed(sessionId, text, primed => host.prompt(sessionId, primed)),
  )

const permit = (optionId: string) => attempt(() => host.permit(sessionId, optionId))

const saveApp = (blocks: Block[]) =>
  apps.save(appTitleOf(blocks, view?.title ?? ""), blocks)

$effect(() => {
  host.loadDatasources().catch(() => {})
})
</script>

{#if view}
  <div class="relative flex min-h-0 flex-1">
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      {#if talking && conversation.full}
        <VoiceConversation {view} onPermit={permit} />
      {:else}
        <div class="@container relative flex min-h-0 flex-1 flex-col">
          <div
            bind:this={scroller}
            class="scroll-stable flex min-h-0 flex-1 flex-col-reverse overflow-y-auto"
            {@attach pinToggles}
            {@attach stickBottom}
          >
            <div
              class="content-zoom chat-column relative mx-auto flex w-full flex-col gap-4 px-3 pt-6 pb-2"
              data-cornered={cornered || undefined}
              data-quote={sessionId}
            >
              {#if host.loading.has(sessionId)}
                <p class="flex items-center justify-center gap-2 text-sm text-base-content/60" role="status">
                  <span class="loading loading-spinner loading-xs"></span>
                  {m.chat_loading_history()}
                </p>
              {/if}
              {#each segments as segment, i (segment.key)}
                {#if segment.kind === "activity"}
                  <ToolGroup items={segment.items} latest={i === segments.length - 1} />
                {:else if segment.item.type === "user"}
                  <UserPrompt item={segment.item} />
                {:else if segment.item.type === "agent"}
                  <AgentReply
                    text={segment.item.text}
                    pace={segment.item.pace}
                    onAction={reply}
                    onReply={text => quoteInto(sessionId, text)}
                    onSave={saveApp}
                    threads={threadsOf(sessionId, segment.item.id).length}
                    onThread={() => {
                      const item = segment.item

                      if (view && item.type === "agent") {
                        attempt(() =>
                          startThread(host, host.id, view, { id: item.id, text: item.text }),
                        )
                      }
                    }}
                    onOpenThread={() => {
                      const latest = threadsOf(sessionId, segment.item.id).at(-1)

                      if (latest) {
                        openThread(latest.host, latest.session)
                      }
                    }}
                  />
                {:else if segment.item.type === "thought"}
                  <ThoughtNote text={segment.item.text} />
                {:else if segment.item.type === "ui"}
                  <UiBlocks blocks={segment.item.blocks} onAction={reply} onSave={saveApp} />
                {/if}
              {/each}
              <QueuedPrompts {queued} images={view.queuedImages} pending={view.pendingImages} />
              {#if view.running && !view.ask}
                <RunningStatus
                  since={view.since}
                  tokens={view.tokens}
                  pace={view.pace}
                />
              {/if}
              {#if view.ask}
                <PermissionCard ask={view.ask} onPermit={permit} />
              {/if}
              {#if view.dialog}
                <TerminalDialog
                  dialog={view.dialog}
                  onPress={strokes => attempt(() => host.press(sessionId, strokes))}
                />
              {/if}
              {#if view.asked?.questions.every(q => q.kind !== "text" && q.kind !== "number")}
                {#key view.asked.id}
                  <QuestionCard
                    asked={view.asked}
                    onAnswer={async answers => {
                      const id = view?.asked?.id

                      return !!id && (await attempt(() => host.answer(sessionId, id, answers)))
                    }}
                  />
                {/key}
              {/if}
              <ErrorAlert message={tries.failure ?? drainFailures[sessionId] ?? null} />
            </div>
          </div>
          <ChatTimeline {scroller} {turns} />
          <ChatCorner
            {plan}
            {agents}
            timeline={hasTimeline(turns)}
            icon={describe({ kind: "session", host: host.id, id: sessionId })?.icon}
            onAgent={view?.external
              ? a =>
                  openConversation({
                    kind: "session",
                    host: host.id,
                    id: sessionId,
                    agent: { id: a.id, description: a.description },
                  })
              : undefined}
          />
        </div>
      {/if}
      <Composer
        busy={!!view.running && !elsewhere}
        running={!!view.running}
        datasources={host.datasources}
        queue
        converse={{ host: host.id }}
        draft={sessionId}
        placeholder={m.chat_placeholder()}
        commands={view.commands}
        onSend={send}
        onStop={() => attempt(() => host.cancel(sessionId))}
        onRecall={queued.length > 0 && view.external ? () => host.recall(sessionId) : undefined}
      >
        {#snippet tools()}
          <SessionTools {host} {view} {elsewhere} {attempt} {send} />
        {/snippet}
        {#snippet extras()}
          <SessionExtras {host} {view} {elsewhere} {attempt} />
        {/snippet}
      </Composer>
    </div>
    {#if panes.hasSide(pane?.())}
      <SidePanel
        entries={view.items.flatMap(i => (i.type === "ui" ? [{ id: i.id, blocks: i.blocks }] : []))}
        {host}
        cwd={view.cwd}
        onAction={reply}
        onSave={saveApp}
      />
    {/if}
    <PcbSide cwd={view.cwd} />
  </div>
{:else}
  <div class="grid flex-1 place-items-center">
    <span class="loading loading-spinner opacity-60"></span>
  </div>
{/if}
