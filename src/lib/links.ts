import { logFailure } from "#lib/logging.ts"
import { desktop } from "#lib/platform.ts"

const external = (href: string) => {
  try {
    const url = new URL(href, location.href)

    return (
      ["http:", "https:", "mailto:"].includes(url.protocol) &&
      url.origin !== location.origin
    )
  } catch {
    return false
  }
}

export const startExternalLinks = () => {
  if (!desktop) {
    return
  }

  const open = (e: MouseEvent) => {
    const wanted = e.type === "click" ? 0 : 1

    if (e.defaultPrevented || e.button !== wanted) {
      return
    }

    const anchor =
      e.target instanceof Element ? e.target.closest("a[href]") : null
    const href = anchor?.getAttribute("href")

    if (!href || !external(href)) {
      return
    }

    e.preventDefault()
    import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(new URL(href, location.href).href))
      .catch(failure => logFailure("open link", failure))
  }

  document.addEventListener("click", open)
  document.addEventListener("auxclick", open)
}
