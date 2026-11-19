import { startAndroidSync } from "./android/sync.svelte.ts"
import { startDesktopCalendar } from "./desktop.ts"

export { requestCalendarAccess, syncNow } from "./android/sync.svelte.ts"

export const startCalendarSync = () => {
  startAndroidSync()
  startDesktopCalendar()
}
