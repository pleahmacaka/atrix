# Atrix

Desktop (Tauri 2) and web client for coding-agent harnesses (Claude Agent, Codex and others) over ACP. Paired devices drive a desktop's harnesses over P2P. Sessions share a markdown knowledge graph and message each other through Atrix.

## Stack

- SvelteKit with `adapter-static`, Svelte 5 runes, TailwindCSS v4, DaisyUI with the custom `atrix-light`/`atrix-dark` themes in `src/app.css`.
- Icons through `@iconify/svelte` plus `vite-plugin-iconify-embed`; write icon names as full literals.
- Paraglide messages in `messages/ko.json` and `messages/en.json`; every UI string goes through `m.*()`.
- Tauri 2 Rust core in `src-tauri/src`: process spawning (`agents.rs`), file access (`files.rs`), presence (`presence.rs`), MCP HTTP listener (`bridge.rs`), versitygw process (`kg.rs`), PCB derive (`pcb.rs`).
- bun for JS dependencies and scripts, cargo for Rust.

## Commands

- `bun run tauri dev`: run the desktop app.
- `bun run check`: vite build plus svelte-check. Must end with 0 errors and 0 warnings.
- `bunx biome check --write src`: format and lint.
- `cargo fmt` and `cargo clippy` in `src-tauri`: both must be clean.

## Architecture

- `src/lib/acp/host.ts` (`Host`) owns ACP connections, sessions, the message postbox and the knowledge service. UI talks to it only through `HostView` (`src/lib/p2p/hostView.svelte.ts`) with `HostRequest`/`HostEvent` from `src/lib/p2p/protocol.ts`, so remote devices use the same path.
- Terminal sessions are mirrored from their files. Each harness kind is a `Source` adapter in `src/lib/acp/sources.ts` (presence, file location, line parser); `mirror.ts` is harness-agnostic. Add a harness by adding an adapter.
- Every session gets an HTTP MCP server named `atrix` (`bridge.ts`, `tools.ts`): `send_message`, `list_sessions` and the `kg_*` knowledge tools. The bearer token identifies the calling session.
- Knowledge documents live in versitygw (posix backend, sidecar metadata, versioning) under `~/.atrix/kg`. `src/lib/knowledge/store.ts` is the only write path: creates use `If-None-Match: *`, updates use `If-Match`, and the author is filled from the session. The schema is in `src/lib/knowledge/document.ts`; examples are in `examples/knowledge`.
- versitygw is not bundled. The app runs `~/.atrix/bin/versitygw.exe` or `versitygw` on PATH.

## UI rules

- Island layout: `base-200` background with `rounded-box border border-base-300 bg-base-100` blocks. No horizontal divider lines inside a block.
- Selected items use `bg-primary/8 text-primary`. Motion stays at 120 to 200 ms.
- No px and no arbitrary Tailwind values, except JSON Canvas node coordinates, which are pixels by spec.
- Settings rows carry a plain title and self-explanatory options only, without hint text.
- Knowledge documents open locked; unlocking enables the Tiptap editor with autosave.

## Testing with live harnesses

- Use fresh sessions in a scratch folder. Codex runs on 6 Luna with Low effort; Claude runs on Haiku with Low effort.
- Never send test prompts into existing user sessions, and restore any setting changed during a test.

## Release

- The version lives in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`; keep them equal.
- Pushing to `main` runs `.github/workflows/release.yml`. When no release exists for the current version, it builds the Windows installer and publishes a release tagged with the bare version, such as `0.2.0` without a `v`.
- Bump the version in all three files to ship a new release.
- Commits are one conventional-commit subject line.
