class Attention {
  active = $state(document.visibilityState === "visible" && document.hasFocus())

  set = (active: boolean) => {
    this.active = active
  }
}

const attention = new Attention()
const sync = () =>
  attention.set(document.visibilityState === "visible" && document.hasFocus())

window.addEventListener("focus", sync, { passive: true })
window.addEventListener("blur", sync, { passive: true })
document.addEventListener("visibilitychange", sync, { passive: true })

export { attention }
