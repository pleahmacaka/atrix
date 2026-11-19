import { setupI18n } from "@atrix/i18n"
import { currentLocale } from "#lib/store/locale.ts"

export const ssr = false
export const prerender = true

export const load = () => setupI18n(currentLocale())
