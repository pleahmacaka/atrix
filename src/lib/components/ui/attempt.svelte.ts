export class Attempt {
  busy = $state(false)

  failure = $state<string | null>(null)

  run = async (work: () => Promise<unknown>) => {
    this.busy = true
    this.failure = null

    try {
      await work()

      return true
    } catch (e) {
      this.failure = e instanceof Error ? e.message : String(e)

      return false
    } finally {
      this.busy = false
    }
  }
}
