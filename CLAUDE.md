# Atrix

Atrix ships as two installable products built from one Tauri 2 app. Atrix DE is a complete desktop environment on its own: the Windows shell (dock, top bar, launcher, panel, notification center), the file explorer and the terminal. Atrix AI is the desktop and web client for coding-agent harnesses (Claude Agent, Codex and others) over ACP plus every AI-native feature: paired devices drive a desktop's harnesses over P2P, and sessions share a markdown knowledge graph and message each other through Atrix. DE features that depend on Atrix AI (the launcher's Atrix group, knowledge links, device pairing) stay hidden while Atrix AI is off.

## Stack

- SvelteKit with `adapter-static`, Svelte 5 runes, TailwindCSS v4, DaisyUI with the custom `atrix-light`/`atrix-dark` themes in `src/app.css`.
- Icons through `@iconify/svelte` plus `vite-plugin-iconify-embed`; write icon names as full literals.
- Paraglide messages in `messages/{en,ko}.json` plus one folder per desktop area (`messages/<area>/{en,ko}.json`, keys prefixed `<area>_`, listed in `project.inlang/settings.json`); every UI string goes through `m.*()`.
- Tauri 2 Rust core in `src-tauri/src`: process spawning (`agents.rs`), file access (`files.rs`), presence (`presence.rs`), MCP HTTP listener (`bridge.rs`), versitygw process (`kg.rs`), PCB derive (`pcb.rs`).
- Cargo workspace crates in `crates/`: `net` (iroh P2P), `web` (wasm client), `calendar-sync` (Android), `files` and `terminal` (Tauri plugins), `window-kit` (child windows), `is-screen-sharing`.
- `apps/installer`: the separate installer app (component choice, change and uninstall on Windows, Linux and macOS).
- bun for JS dependencies and scripts, cargo for Rust.

## Commands

- `bun run tauri dev`: run the desktop app.
- `bun run check`: vite build plus svelte-check. Must end with 0 errors and 0 warnings.
- `bunx biome check --write src`: format and lint.
- `cargo fmt --all` and `cargo clippy --workspace --all-targets`: both must be clean.
- `bun test tests`: unit tests, mirroring the source layout under `tests/`.

## Architecture

- `src/lib/acp/host.ts` (`Host`) owns ACP connections, sessions, the message postbox and the knowledge service. UI talks to it only through `HostView` (`src/lib/p2p/hostView.svelte.ts`) with `HostRequest`/`HostEvent` from `src/lib/p2p/protocol.ts`, so remote devices use the same path.
- Terminal sessions are mirrored from their files. Each harness kind is a `Source` adapter in `src/lib/acp/sources.ts` (presence, file location, line parser); `mirror.ts` is harness-agnostic. Add a harness by adding an adapter.
- Every session gets an HTTP MCP server named `atrix` (`bridge.ts`, `tools.ts`): `send_message`, `list_sessions` and the `kg_*` knowledge tools. The bearer token identifies the calling session.
- Knowledge documents live in versitygw (posix backend, sidecar metadata, versioning) under `~/.atrix/kg`. `src/lib/knowledge/store.ts` is the only write path: creates use `If-None-Match: *`, updates use `If-Match`, and the author is filled from the session. The schema is in `src/lib/knowledge/document.ts`; examples are in `examples/knowledge`.
- versitygw is not bundled. The app runs `~/.atrix/bin/versitygw.exe` or `versitygw` on PATH.
- Components are chosen in `~/.atrix/desktop.json` (`agent` for Atrix AI; `shell`, `files` and `terminal` for Atrix DE), read once at startup (`src-tauri/src/desktop/components.rs`); the Atrix DE settings window (`/shell/settings`, opened with `openDesktopSettings`) and the installer write it. On Windows the shell or Atrix AI stays on; elsewhere Atrix AI is required. Atrix AI's own settings dialog holds no desktop settings. The shell is Windows-only and off by default; with Atrix AI off the main window stays hidden but keeps running as the host and bridge.
- Shell windows are `create:false` templates in `tauri.conf.json` with routes under `src/routes/shell/*`; their code lives in `src/lib/desktop` and `src-tauri/src/desktop`. They are separate webviews: the root layout skips Atrix startup for them, and they reach Atrix data through the main window (`src/lib/p2p/float.svelte.ts` bridge, or main-window events such as the launcher's and `openDesktopSettings`).
- The file explorer (`src/lib/files`, `crates/files`) and terminal (`src/lib/terminal`, `crates/terminal`) run as child windows on desktop; the explorer is the `files` page on Android, and the terminal also backs the chat side panel. File sharing runs on the single `atrix-net` endpoint and its paired-device roster.
- The shell hides the Windows taskbar while it runs; startup with the shell off restores a taskbar left hidden by a forced exit. Develop shell features with `--headless` first, because a running shell owns the taskbar.

## UI rules

- Island layout: `base-200` background with `rounded-box border border-base-300 bg-base-100` blocks. No horizontal divider lines inside a block.
- Selected items use `bg-primary/8 text-primary`. Motion stays at 120 to 200 ms.
- No px and no arbitrary Tailwind values, except JSON Canvas node coordinates, which are pixels by spec.
- Settings rows carry a plain title and self-explanatory options only, without hint text. Every row explains itself through the `tip` of `SettingRow` (a one-sentence tooltip on hover and keyboard focus saying what the setting changes).
- Knowledge documents open locked; unlocking enables the Tiptap editor with autosave.

## Testing with live harnesses

- Use fresh sessions in a scratch folder. Codex runs on 6 Luna with Low effort; Claude runs on Haiku with Low effort.
- Never send test prompts into existing user sessions, and restore any setting changed during a test.

## Release

- The version lives in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`; keep them equal.
- Pushing to `main` runs `.github/workflows/release.yml`. When no release exists for the current version, it builds Windows (NSIS setup and installer), Linux (deb, AppImage and installer), macOS (dmg, updater bundle and installer) and Android (arm64 APK), and publishes a release tagged with the bare version, such as `0.2.0` without a `v`, with `latest.json` for the updater.
- Bump the version in all three files to ship a new release.
- Commits are one conventional-commit subject line.
