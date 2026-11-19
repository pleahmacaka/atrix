<script lang="ts">
import Icon from "@iconify/svelte"
import { untrack } from "svelte"
import EmptyState from "#lib/components/ui/EmptyState.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import { m } from "#lib/paraglide/messages.js"
import { currentLocale } from "#lib/store/locale.ts"
import { formatDate } from "../../format"
import { type ChangeGroup, changeGroups } from "../../git"
import { commitGraph } from "../../gitgraph"
import {
  type GitCommit,
  type GitSync,
  gitCommit,
  gitLog,
  gitStage,
  gitSync,
  gitUnstage,
} from "../../native"
import { fail } from "../../store/command-errors"
import type { Insight } from "../../store/insight.svelte"
import { trustRepo } from "../../store/trust"
import { GIT_TONES } from "../items/decor"
import RepoChip from "../items/RepoChip.svelte"
import CommitGraph from "./CommitGraph.svelte"

type Action = {
  one: string
  all: string
  oneLabel: () => string
  allLabel: () => string
  icon: string
  apply: (root: string, paths: string[]) => Promise<void>
}

let { insight }: { insight: Insight } = $props()

let commits = $state<GitCommit[]>([])

let message = $state("")

let busy = $state<string | null>(null)

const STAGE: Action = {
  one: "stage",
  all: "stageAll",
  oneLabel: m.files_git_stage,
  allLabel: m.files_git_stage_all,
  icon: "lucide:plus",
  apply: gitStage,
}

const ACTIONS: Record<ChangeGroup["id"], Action> = {
  staged: {
    one: "unstage",
    all: "unstageAll",
    oneLabel: m.files_git_unstage,
    allLabel: m.files_git_unstage_all,
    icon: "lucide:minus",
    apply: gitUnstage,
  },
  changes: STAGE,
  untracked: STAGE,
}

const GROUP_LABELS: Record<ChangeGroup["id"], () => string> = {
  staged: m.files_git_groups_staged,
  changes: m.files_git_groups_changes,
  untracked: m.files_git_groups_untracked,
}

const SYNC: { id: GitSync; icon: string; label: () => string }[] = [
  { id: "fetch", icon: "lucide:refresh-cw", label: m.files_git_fetch },
  { id: "pull", icon: "lucide:arrow-down-to-line", label: m.files_git_pull },
  { id: "push", icon: "lucide:arrow-up-from-line", label: m.files_git_push },
]

const HEADING = [
  "flex min-h-7 items-center gap-2 px-2",
  "text-xs font-medium text-base-content/60",
]

const repo = $derived(insight.view.repo)

const status = $derived(insight.view.git)

const groups = $derived(
  status ? changeGroups(status).filter(group => group.rows.length) : [],
)

const staged = $derived(groups.some(group => group.id === "staged"))

const ready = $derived(busy === null && staged && message.trim() !== "")

const graph = $derived(commitGraph(commits))

const history = $derived(
  status &&
    [
      status.root,
      status.branch,
      status.ahead,
      status.behind,
      status.changes.length,
    ].join("\0"),
)

const lanes = $derived(Math.max(1, ...graph.map(row => row.width)))

$effect(() => {
  const owner = insight

  owner.whole = true

  return () => {
    owner.whole = false
  }
})

$effect(() => {
  const root = history && untrack(() => status?.root)
  let live = true

  if (!root) {
    return
  }

  gitLog(root)
    .catch(() => [])
    .then(list => {
      if (live) {
        commits = list
      }
    })

  return () => {
    live = false
  }
})

const run = async (id: string, work: (root: string) => Promise<void>) => {
  const owner = insight
  const root = owner.view.git?.root

  if (!root) {
    return false
  }

  busy = id

  try {
    await work(root)

    return true
  } catch (reason) {
    fail(reason)

    return false
  } finally {
    busy = null
    owner.refreshGit()
  }
}

const commit = async () => {
  const text = message.trim()

  if (await run("commit", root => gitCommit(root, text))) {
    message = ""
  }
}

const split = (path: string) => {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path
  const cut = trimmed.lastIndexOf("/")

  return { name: trimmed.slice(cut + 1), dir: trimmed.slice(0, cut + 1) }
}
</script>

{#if repo && !status}
  <EmptyState
    icon="lucide:shield-question"
    text={m.files_git_untrusted()}
    centered
  >
    <button
      type="button"
      class="btn btn-soft btn-primary btn-sm"
      onclick={() => trustRepo(repo.root)}
    >
      {m.files_git_trust()}
    </button>
  </EmptyState>
{:else if status}
  <div class="flex min-h-0 grow flex-col gap-4 overflow-y-auto text-sm">
    <div class="flex min-w-0 items-center gap-2 ps-1">
      <RepoChip
        kind="repo"
        head={status.head}
        title={status.upstream ?? undefined}
      />
      {#if status.superproject}
        <RepoChip kind="submodule" title={status.superproject} />
      {/if}
      {#if status.ahead || status.behind}
        <span
          class={[
            "shrink-0 text-xs whitespace-nowrap",
            "text-base-content/55 tabular-nums",
          ]}
        >
          ↑{status.ahead} ↓{status.behind}
        </span>
      {/if}
      <div class="ms-auto flex shrink-0 gap-0.5">
        {#each SYNC as sync (sync.id)}
          <IconButton
            icon={sync.icon}
            label={sync.label()}
            size="xs"
            iconClass="size-3.5"
            busy={busy === sync.id}
            disabled={busy !== null}
            onclick={() => run(sync.id, root => gitSync(root, sync.id))}
          />
        {/each}
      </div>
    </div>

    <div class="flex shrink-0 flex-col gap-2">
      <textarea
        bind:value={message}
        rows="2"
        placeholder={m.files_git_message()}
        aria-label={m.files_git_message()}
        class="textarea textarea-sm w-full resize-none"
        onkeydown={e => {
          if (e.key === "Enter" && e.ctrlKey && ready) {
            e.preventDefault()
            commit()
          }
        }}
      ></textarea>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        disabled={!ready}
        onclick={commit}
      >
        {#if busy === "commit"}
          <span class="loading loading-spinner loading-xs"></span>
        {:else}
          <Icon icon="lucide:check" class="size-4" />
        {/if}
        {m.files_git_commit()}
      </button>
    </div>

    {#each groups as group (group.id)}
      {@const action = ACTIONS[group.id]}
      {@const tone = GIT_TONES[group.tone]}

      <section class="flex shrink-0 flex-col">
        <div class={["group/head", HEADING]}>
          <span class="min-w-0 truncate">{GROUP_LABELS[group.id]()}</span>
          <span class="shrink-0 text-base-content/40 tabular-nums">
            {group.rows.length}
          </span>
          <button
            type="button"
            class={[
              "btn btn-ghost btn-xs ms-auto shrink-0 opacity-0",
              "transition-opacity duration-140",
              "group-hover/head:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
            ]}
            disabled={busy !== null}
            onclick={() =>
              run(action.all, root =>
                action.apply(
                  root,
                  group.rows.map(row => row.path),
                ),
              )}
          >
            {action.allLabel()}
          </button>
        </div>

        <ul class="flex flex-col">
          {#each group.rows as row (row.path)}
            {@const parts = split(row.path)}

            <li
              class={[
                "group/row flex min-h-7 min-w-0 items-center gap-2",
                "rounded-field ps-2 pe-1.5 transition-colors duration-140",
                "hover:bg-base-content/8",
              ]}
            >
              <span class="min-w-0 grow truncate" title={row.path}>
                <span class={tone}>{parts.name}</span>
                <span class="text-xs text-base-content/40">{parts.dir}</span>
              </span>
              <IconButton
                icon={action.icon}
                label={action.oneLabel()}
                size="xs"
                iconClass="size-3.5"
                class={[
                  "shrink-0 opacity-0 transition-opacity duration-140",
                  "group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
                ]}
                disabled={busy !== null}
                onclick={() =>
                  run(action.one, root => action.apply(root, [row.path]))}
              />
              <span
                class={["w-3 shrink-0 text-center text-xs font-semibold", tone]}
              >
                {row.letter}
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <p class="px-2 text-center text-xs text-base-content/55">
        {m.files_git_clean()}
      </p>
    {/each}

    {#if commits.length}
      <section class="flex shrink-0 flex-col">
        <div class={HEADING}>{m.files_git_history()}</div>

        <ul class="flex flex-col">
          {#each commits as entry, index (entry.hash)}
            <li class="flex h-11 min-w-0 items-stretch gap-2 pe-2">
              <CommitGraph row={graph[index]} {lanes} />

              <span class="flex min-w-0 grow flex-col justify-center">
                <span class="flex min-w-0 items-center gap-1">
                  {#each entry.refs as name (name)}
                    <span
                      class={[
                        "badge badge-xs badge-soft badge-primary",
                        "max-w-24 shrink-0 truncate",
                      ]}
                      title={name}
                    >
                      {name}
                    </span>
                  {/each}
                  <span class="min-w-0 truncate" title={entry.subject}>
                    {entry.subject}
                  </span>
                </span>

                <span class="flex min-w-0 gap-2 text-xs text-base-content/55">
                  <span class="shrink-0 tabular-nums">{entry.hash}</span>
                  <span class="min-w-0 grow truncate" title={entry.author}>
                    {entry.author}
                  </span>
                  <span class="shrink-0 tabular-nums">
                    {formatDate(entry.time, currentLocale())}
                  </span>
                </span>
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
{/if}
