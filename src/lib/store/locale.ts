import { m } from "#lib/paraglide/messages.js"
import {
  getLocale,
  isLocale,
  localStorageKey,
  setLocale,
} from "#lib/paraglide/runtime.js"

export type LanguageChoice = "system" | "en" | "ko"

export const LANGUAGES: { id: LanguageChoice; label: string; icon: string }[] =
  [
    { id: "system", label: m.appearance_system(), icon: "lucide:monitor" },
    { id: "en", label: "English", icon: "lucide:languages" },
    { id: "ko", label: "한국어", icon: "lucide:languages" },
  ]

export const languageChoice = (): LanguageChoice => {
  const saved = localStorage.getItem(localStorageKey)

  return saved && isLocale(saved) ? saved : "system"
}

export const chooseLanguage = (choice: LanguageChoice) => {
  if (choice === "system") {
    localStorage.removeItem(localStorageKey)
    location.reload()

    return
  }

  setLocale(choice)
}

export const currentLocale = () => getLocale()
