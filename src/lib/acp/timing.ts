import { info } from "@tauri-apps/plugin-log"

export const timed = (phase: string, started: number, detail: string) => {
  const line = `harness ${phase} ${Math.round(performance.now() - started)}ms ${detail}`

  console.info(line)
  info(line).catch(() => {})
}
