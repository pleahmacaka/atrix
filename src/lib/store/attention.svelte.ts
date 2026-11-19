const looking = () =>
  document.visibilityState === "visible" && document.hasFocus()

class Attention {
  active = $state(looking())

  constructor() {
    const update = () => {
      this.active = looking()
    }

    window.addEventListener("focus", update)
    window.addEventListener("blur", update)
    document.addEventListener("visibilitychange", update)
  }
}

export const attention = new Attention()
