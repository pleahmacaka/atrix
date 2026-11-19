import { m } from "#lib/paraglide/messages.js"
import {
  getLocale,
  isLocale,
  localStorageKey,
  setLocale,
} from "#lib/paraglide/runtime.js"

export type LanguageChoice = "system" | "en" | "ko"

export const LANGUAGES: { id: LanguageChoice; label: string }[] = [
  { id: "system", label: m.appearance_system() },
  { id: "en", label: "English" },
  { id: "ko", label: "한국어" },
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
