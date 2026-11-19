<script lang="ts">
import Icon from "@iconify/svelte"
import { errorText } from "#lib/components/ui/attempt.svelte.ts"
import ErrorAlert from "#lib/components/ui/ErrorAlert.svelte"
import IconButton from "#lib/components/ui/IconButton.svelte"
import type { GitAction } from "#lib/git/action.ts"
import { type Change, isStaged, isUnstaged, parseStatus, type Status } from "#lib/git/status.ts"
import type { HostView } from "#lib/p2p/hostView.svelte.ts"
import { m } from "#lib/paraglide/messages.js"
import { baseName } from "#lib/path.ts"
import GitDiff from "./GitDiff.svelte"

let { host, cwd }: { host: HostView; cwd: string } = $props()

const FAILED = "git_failed:"

let status = $state<Status | null>(null)

let failure = $state<string | null>(null)

let busy = $state<string | null>(null)

let message = $state("")

let diff = $state<{ file: string; text: string } | null>(null)

const staged = $derived(status?.files.filter(isStaged) ?? [])

const unstaged = $derived(status?.files.filter(isUnstaged) ?? [])

const git = (action: GitAction) => host.call({ op: "git.run", path: cwd, action })

const fail = (e: unknown) => {
  const text = errorText(e)

  failure = text.startsWith(FAILED) ? text.slice(FAILED.length) : text
}

const refresh = async () => {
  try {
    status = parseStatus(await git({ kind: "status" }))
  } catch (e) {
    status = null
    fail(e)
  }
}

const run = async (key: string, action: GitAction) => {
  busy = key
  failure = null

  try {
    await git(action)

    if (action.kind === "commit") {
      message = ""
    }
  } catch (e) {
    fail(e)
  } finally {
    busy = null
  }

  await refresh()
}

const openDiff = async (change: Change, fromIndex: boolean) => {
  const action: GitAction =
    !fromIndex && change.worktree === "?"
      ? { kind: "untracked", file: change.path }
      : { kind: "diff", file: change.path, staged: fromIndex }

  try {
    diff = { file: change.path, text: await git(action) }
  } catch (e) {
    fail(e)
  }
}

$effect(() => {
  void cwd
  failure = null
  status = null
  refresh()
})
</script>

{#snippet files(list: Change[], fromIndex: boolean)}
  <ul class="flex flex-col">
    {#each list as change (change.path)}
      <li class="group flex h-8 items-center gap-1 rounded-field px-1 hover:bg-base-content/8">
        <button
          type="button"
          class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-start text-sm"
          title={change.path}
          onclick={() => openDiff(change, fromIndex)}
        >
          <span class="min-w-0 flex-1 truncate">{baseName(change.path)}</span>
          <span class="shrink-0 text-xs text-base-content/50 tabular-nums">
            {fromIndex ? change.index : change.worktree === "?" ? "U" : change.worktree}
          </span>
        </button>
        <IconButton
          icon={fromIndex ? "lucide:minus" : "lucide:plus"}
          label={fromIndex ? m.git_unstage() : m.git_stage()}
          size="xs"
          class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          disabled={busy !== null}
          onclick={() =>
            run(change.path, {
              kind: fromIndex ? "unstage" : "stage",
              files: [change.path],
            })}
        />
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet group(title: string, list: Change[], fromIndex: boolean)}
  <section class="flex flex-col gap-0.5">
    <header class="flex h-8 items-center gap-2 px-1">
      <h3 class="min-w-0 flex-1 truncate text-xs font-medium text-base-content/60">
        {title}
      </h3>
      <span class="text-xs text-base-content/50 tabular-nums">{list.length}</span>
      <IconButton
        icon={fromIndex ? "lucide:minus" : "lucide:plus"}
        label={fromIndex ? m.git_unstage_all() : m.git_stage_all()}
        size="xs"
        disabled={busy !== null}
        onclick={() =>
          run("all", { kind: fromIndex ? "unstage" : "stage", files: [] })}
      />
    </header>
    {@render files(list, fromIndex)}
  </section>
{/snippet}

<div class="flex flex-col gap-3 p-2">
  <header class="flex items-center gap-1">
    <Icon icon="lucide:git-branch" class="size-4 shrink-0 text-base-content/60" />
    <span class="min-w-0 flex-1 truncate text-sm font-medium">
      {status?.branch ?? baseName(cwd)}
    </span>
    <IconButton
      icon="lucide:refresh-cw"
      label={m.git_refresh()}
      size="xs"
      onclick={refresh}
    />
    <IconButton
      icon="lucide:arrow-down-to-line"
      label={m.git_pull()}
      size="xs"
      busy={busy === "pull"}
      disabled={busy !== null}
      onclick={() => run("pull", { kind: "pull" })}
    />
    <IconButton
      icon="lucide:arrow-up-from-line"
      label={m.git_push()}
      size="xs"
      busy={busy === "push"}
      disabled={busy !== null}
      onclick={() => run("push", { kind: "push" })}
    />
  </header>

  {#if status}
    <form
      class="flex flex-col gap-2"
      onsubmit={e => {
        e.preventDefault()
        run("commit", { kind: "commit", message: message.trim() })
      }}
    >
      <textarea
        class="textarea textarea-sm min-h-16 w-full resize-y"
        placeholder={m.git_message()}
        aria-label={m.git_message()}
        bind:value={message}
        onkeydown={e => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.currentTarget.form?.requestSubmit()
          }
        }}
      ></textarea>
      <button
        type="submit"
        class="btn btn-primary btn-sm"
        disabled={busy !== null || staged.length === 0 || !message.trim()}
      >
        {#if busy === "commit"}
          <span class="loading loading-spinner loading-xs"></span>
        {/if}
        {m.git_commit()}
      </button>
    </form>

    {#if status.files.length === 0}
      <p class="px-1 text-sm text-base-content/60">{m.git_clean()}</p>
    {/if}
    {#if staged.length > 0}
      {@render group(m.git_staged(), staged, true)}
    {/if}
    {#if unstaged.length > 0}
      {@render group(m.git_changes(), unstaged, false)}
    {/if}
  {/if}

  <ErrorAlert message={failure} />
</div>

{#if diff}
  <GitDiff
    file={diff.file}
    text={diff.text}
    onclose={() => {
      diff = null
    }}
  />
{/if}
