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
    if (e.defaultPrevented || (e.type === "click" && e.button !== 0)) {
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
      .catch(console.error)
  }

  document.addEventListener("click", open)
  document.addEventListener("auxclick", open)
}
